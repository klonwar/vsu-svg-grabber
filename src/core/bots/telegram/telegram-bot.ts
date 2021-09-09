import {Bot} from "#src/core/bots/bot";
import {StateItem} from "#src/core/state-item";
import TelegramClient from "#src/core/bots/telegram/util/telegram-client";
import chalk from "chalk";

export class TelegramBot implements Bot {
  private telegramClient = new TelegramClient(process.env.TELEGRAM_TOKEN, {polling: true});
  private initialized = false;

  constructor() {
    this.telegramClient.init().then(() => {
      this.initialized = true;
    });
  }

  async sendMessage(item: StateItem): Promise<void> {
    if (!this.initialized) {
      console.log(chalk.yellow(`-@@ Telegram bot is not initialized`));
      return;
    }

    await this.telegramClient.sendAll(item);
  }
}