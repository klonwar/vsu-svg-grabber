import TelegramBot, { Message } from "node-telegram-bot-api";
import chalk from "chalk";
import writeFile from "#src/core/util/write-file";
import readFile from "#src/core/util/read-file";
import telegramDataConstructor from "#src/core/bots/telegram/util/telegram-data-constructor";
import Task from "#src/core/task/task";
import os from "os";
import moment from "moment";
import { StateItem } from "#src/core/state-item";
import { TELEGRAM_CONFIG } from "#src/config";

class TelegramClient extends TelegramBot {
  private readonly chatIdsFile = `db/chat-ids.db`;
  private chatIds: Array<number> = [];
  tasks = new Map<number, Task>();

  constructor(token: string, options?: TelegramBot.ConstructorOptions) {
    super(token, options);

    this.setMyCommands([
      { command: `/start`, description: `Start receiving notifications` },
      { command: `/help`, description: `Show help` },
      { command: `/memory `, description: `Show used RAM` },
      { command: `/ping `, description: `Check bot availability` },
      { command: `/status `, description: `Show bot status` },
    ]);

    this.onText(/\/start/, async (msg) => {
      if (!this.chatIds.includes(msg.chat.id)) {
        console.log(`-@@ [${chalk.greenBright(`BOT`)}] +${msg.chat.id}`);
        this.chatIds.push(msg.chat.id);
        await this.saveIds();
      }
    });

    this.onText(/\/users/, async (msg) => {
      if (this.isAdmin(msg)) {
        const adminId = msg.chat.id;

        const userDatasPromises = this.chatIds.map(async (id) => {
          if (id !== adminId) {
            const chat = await this.getChat(id);
            return [chat.id, chat.username];
          }
        });

        const userDatasResult = await Promise.allSettled(userDatasPromises);
        const userDatas = userDatasResult
          .filter((item) =>
            item.status === `fulfilled` && item.value
          );
        await this.sendMessage(
          adminId,
          userDatas
            .map((item) => item.status === `fulfilled` && item.value)
            .filter(([, username]) => !!username)
            .map(([id, username], index) =>
              `${index + 1}.  [${id}]  @${username}`
            )
            .join(`\n`),
        )
        ;
      } else {
        await this.sendMessage(
          msg.chat.id,
          `403 Forbidden`,
        );
      }
    });

    this.onText(/\/broadcast /, async (msg) => {
      if (this.isAdmin(msg)) {
        const adminId = msg.chat.id;
        const message = msg.text.replace(/\/broadcast /, ``);

        const broadcastPromises = this.chatIds.map(async (id) => {
          if (id !== adminId) {
            await this.sendMessage(
              id,
              message,
            );
          }
        });

        await Promise.allSettled(broadcastPromises);

        await this.sendMessage(
          adminId,
          `Отправлено всем пользователям бота:`,
        );
        await this.sendMessage(
          adminId,
          message,
        );
      } else {
        await this.sendMessage(
          msg.chat.id,
          `403 Forbidden`,
        );
      }
    });

    this.onText(/\/help/, async (msg) => {
      await this.sendMessage(
        msg.chat.id,
        TELEGRAM_CONFIG.helpMessage,
      );
    });

    this.onText(/\/memory/, async (msg) => {
      const div = (8 * 2 ** 10 * 2 ** 10);
      const total = Math.floor(os.totalmem() / div) / 1024;
      const avail = Math.floor(os.freemem() / div) / 1024;
      const used = total - avail;

      await this.sendMessage(
        msg.chat.id,
        `${used.toFixed(3)} / ${total.toFixed(3)} GB (${(~~(used / total * 10000) / 100).toFixed(2)}%)`
      );
    });

    this.onText(/\/ping/, async (msg) => {
      await this.sendMessage(
        msg.chat.id,
        `Alive`
      );
    });

    this.onText(/\/status/, async (msg) => {
      const botStatus = this.tasks.get(msg.chat.id)?.botStatus;
      if (!botStatus)
        await this.sendMessage(
          msg.chat.id,
          `Ничего не скачиваю`
        );
      else {
        const lastDate = botStatus[botStatus.length - 1].start;

        const deltas = {
          d: moment().diff(lastDate, `days`),
          h: moment().diff(lastDate, `hours`),
          m: moment().diff(lastDate, `minutes`),
          s: moment().diff(lastDate, `seconds`),
          ms: moment().diff(lastDate, `milliseconds`),
        };
        const timeLabel = Object.entries(deltas).find(([, value]) => {
          if (value) {
            return true;
          }
        }).reverse().join(``);

        await this.sendMessage(
          msg.chat.id,
          botStatus.map((item) => `_${item.status}_`).join(` / `) + ` \\- ${timeLabel}`,
          { parse_mode: `MarkdownV2` }
        );
      }
    });

    this.onText(/https:\/\/[a-zA-Z0-9_-]+\.edu\.vsu\.ru\/bigbluebutton\/presentation\/[a-zA-Z0-9/_-]+\/svg(\/[0-9]*)?/, async (msg, match) => {
      const link = match[0].replace(/\/svg\/[0-9]+/, `/svg/`);
      const username = msg.chat.username ?? msg.chat.id + ``;

      if (this.tasks.get(msg.chat.id)) {
        await this.sendMessage(
          msg.chat.id,
          `Скачивание уже запущено, ожидайте`
        );
        return;
      }

      console.log(`-@ Downloading ${link} for @${username}`);
      await this.sendMessage(
        msg.chat.id,
        `Скачиваю ${link}`
      );


      this.tasks.set(msg.chat.id, new Task(link, username, async (props) => {
        if (!props) {
          await this.sendMessage(
            msg.chat.id,
            `По данной ссылке нет ни одного слайда`
          );
        } else {
          const { file, filename } = props;
          await this.sendDocument(msg.chat.id, file, {}, {
            filename,
          });

          if (!this.tasks.get(msg.chat.id).isFullPresentation) {
            await this.sendMessage(
              msg.chat.id,
              `Внимание! Из-за нестабильности мудла некоторые слайды были пропущены. Повторите попытку позже`
            );
          }
        }

        console.log(`-@ Completed task for @${username}`);
        this.tasks.delete(msg.chat.id);
      }));
    });
  }

  async init(): Promise<void> {
    try {
      this.chatIds = await readFile<Array<number>>(this.chatIdsFile,
        (str) => str
          .split(`\n`)
          .filter((item) => item.length > 0)
          .map((item) => parseInt(item))
      );
    } catch (e) {
      if (e.message.includes(`ENOENT`)) {
        await this.saveIds();
      } else {
        throw e;
      }
    }
  }

  private async saveIds(): Promise<void> {
    await writeFile(this.chatIdsFile, this.chatIds.join(`\n`));
  }

  private isAdmin(msg: Message): boolean {
    return !!msg.chat.username && msg.chat.username === process.env.ADMIN_NICKNAME;
  }

  async sendAll(item: StateItem): Promise<void> {
    let time = new Date().getTime();
    await Promise.allSettled(this.chatIds.map((chatId) => (async () => {
      try {
        await this.sendMessage(chatId, telegramDataConstructor(item), {
          parse_mode: `MarkdownV2`
        });
      } catch (e) {
        console.error(e.stack);
      }
    })()));
    time = new Date().getTime() - time;
    console.log(`-@@ [${chalk.red(`TELEGRAM`)}] ${(time / 1000).toFixed(3)}s`);
  }
}

export default TelegramClient;