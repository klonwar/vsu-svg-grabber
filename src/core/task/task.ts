import fetch from "node-fetch";
import pdfkit from "pdfkit";
import svg2pdf from "svg-to-pdfkit";
import { waitFor } from "#src/core/util/wait-for";
import chalk from "chalk";
import { MAX_ERROR_STRIKE, MAX_PRESENTATION_LENGTH } from "#src/config";

export enum BotStatusEnum {
  NOT_STARTED = `Not started`,
  STARTED = `Started`,
  COUNTING = `Counting slides`,
  DOWNLOADING_SVGS = `Downloading svgs`,
  CONVERTING_SVGS = `Converting svgs`,
  CREATING_PDF = `Creating pdf`,
}

export interface BotStatus {
  status: BotStatusEnum,
  start: Date
}


interface SubscribeFunctionProps {
  file: Buffer,
  filename: string
}

type SubscribeFunction = (props: SubscribeFunctionProps) => Promise<void>;


class Task {
  public botStatus: BotStatus[] = [{
    status: BotStatusEnum.NOT_STARTED,
    start: new Date()
  }];

  public isFullPresentation = true;

  constructor(private link: string, private username: string, onFinish: SubscribeFunction) {
    this.downloadPresentation().then(onFinish);
  }

  private pushBotStatus(...status: BotStatusEnum[]): void {
    this.botStatus.push(...status.map((item) => ({
      status: item,
      start: new Date()
    })));
  }

  private setBotStatus(...status: BotStatusEnum[]): void {
    this.botStatus.length = 0;
    this.pushBotStatus(...status);
  }

  private removeBotStatus(...status: BotStatusEnum[]): void {
    const newStatus = this.botStatus.filter((item) => !status.includes(item.status));
    this.botStatus.length = 0;
    this.botStatus.push(...newStatus);
  }

  private async getPresentationLength(): Promise<number> {
    this.pushBotStatus(BotStatusEnum.COUNTING);

    // Проверим, есть ли первый слайд
    const isPresentationExists = await new Promise((resolve) => {
      fetch(`${this.link}/1`).then((res) => resolve(res.status === 200));
    });

    if (!isPresentationExists)
      return 0;

    // Получим длину презы двоичным поиском
    let l = 1;
    let r = MAX_PRESENTATION_LENGTH;

    let errorStrike = 0;

    while (l < r) {
      const m = Math.floor((l + r) / 2);

      let isExists;
      try {
        isExists = await new Promise((resolve, reject) => {
          fetch(`${this.link}/${m}`).then((res) => resolve(res.status === 200)).catch((e) => reject(e));
        });
      } catch (e) {
        if (errorStrike <= MAX_ERROR_STRIKE) {
          console.error(chalk.yellow(`-(@${this.username})[getPresentationLength]! ${e.message}. Repeating`));
          errorStrike++;
          await waitFor(1000);
          continue;
        } else {
          console.error(chalk.red(`-(@${this.username})[getPresentationLength]! Cannot open slide number ${m}`));
          isExists = false;
        }
      }

      errorStrike = 0;
      if (isExists) {
        l = m + 1;
      } else {
        r = m;
      }
    }

    this.removeBotStatus(BotStatusEnum.COUNTING);
    return l - 1;
  }

  private async generatePdf(imageBuffers: Array<string>): Promise<Buffer> {
    this.pushBotStatus(BotStatusEnum.CREATING_PDF);

    const buffer = await new Promise<Buffer>((resolve) => {
      const doc = new pdfkit({autoFirstPage: false});
      const pdfBuffers = [];

      doc.on(`data`, pdfBuffers.push.bind(pdfBuffers));
      doc.on(`end`, () => {
        resolve(Buffer.concat(pdfBuffers));
      });

      let savedWidth = 1000;
      let savedHeight = 800;

      const pxToPt = (px) => px * 0.75292857248934;

      for (const item of imageBuffers) {
        if (!item) {
          this.isFullPresentation = false;
          console.error(chalk.red(`-(@${this.username})[generatePdf]! Skip missing slide`));
          doc.addPage({size: [500, 500]});
          continue;
        }

        let width = parseInt(item.match(/width="([0-9.]+)pt"/)?.[1] ?? ``) || undefined;
        let height = parseInt(item.match(/height="([0-9.]+)pt"/)?.[1] ?? ``) || undefined;

        if (!width || !height) {
          width = pxToPt(parseInt(item.match(/width="([0-9.]+)px"/)?.[1] ?? ``)) || undefined;
          height = pxToPt(parseInt(item.match(/height="([0-9.]+)px"/)?.[1] ?? ``)) || undefined;
        }

        if (!width || !height) {
          width = savedWidth;
          height = savedHeight;
        }

        savedWidth = width;
        savedHeight = height;

        svg2pdf(doc.addPage({size: [width, height]}), item);
      }
      doc.end();
    });

    this.removeBotStatus(BotStatusEnum.CREATING_PDF);
    return buffer;
  }

  private async fetchAndResolveText(url): Promise<string | null> {
    return new Promise((resolve) => {
      fetch(url).then((res) => res.text()).then(resolve).catch(() => resolve(null));
    });
  }

  private async downloadPresentation(): Promise<SubscribeFunctionProps> {
    this.setBotStatus(BotStatusEnum.STARTED);
    const fetchPromises: Promise<string>[] = [];

    const length = await this.getPresentationLength();

    if (length === 0)
      return null;


    for (let i = 1; i <= length; i++) {
      fetchPromises.push((async () => {
        let text;
        let errorStrike = 0;

        while (!text && errorStrike <= MAX_ERROR_STRIKE) {
          text = await this.fetchAndResolveText(`${this.link}/${i}`);
          errorStrike++;

          if (!text) {
            console.error(chalk.yellow(`-(@${this.username})[downloadPresentation]! Error when loading slide #${i}. Repeating`));
          }
        }

        return text;
      })());
    }

    this.pushBotStatus(BotStatusEnum.DOWNLOADING_SVGS);
    const svgBuffers = await Promise.all(fetchPromises);
    this.removeBotStatus(BotStatusEnum.DOWNLOADING_SVGS);

    const pdf = await this.generatePdf(svgBuffers);

    this.setBotStatus(BotStatusEnum.NOT_STARTED);

    return {
      file: pdf,
      filename: `presentation.pdf`
    };
  }
}

export default Task;