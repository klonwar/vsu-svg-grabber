process.env[`NTBA_FIX_350`] = `1`;

import {BOT_NAME} from "#src/config";
import {Bot} from "#src/core/bots/bot";
import {TelegramBot} from "#src/core/bots/telegram/telegram-bot";
import checkMemory from "#src/core/util/check-memory";
import {waitFor} from "#src/core/util/wait-for";

require(`dotenv`).config();

(async () => {
  console.log(BOT_NAME);

  const bot: Bot = new TelegramBot();

  // Проверка на превышение по памяти
  for (;;) {
    try {
      await waitFor(5000);
      checkMemory(parseInt(process.env.MEMORY_EDGE) || 200);
    } catch (e) {
      if (e.message === `restart`) {
        throw e;
      }
    }
  }

})().catch((err) => {
  if (err.message === `restart`) {
    process.exit(2);
  }

  console.error(`\n` + err.stack);

  process.exit(1);
});