import pjson from "#root/package.json";
import {StateItem} from "#src/core/state-item";

export const BOT_NAME = `- VSU SVG Grabber v${pjson.version} -`;

export const MAX_ERROR_STRIKE = 5;

export const MAX_PRESENTATION_LENGTH = 500;

export const TELEGRAM_CONFIG = {
  createTitle: (item: StateItem): string => item.info.title.replace(/Объявление/, ``) + ` - ${item.info.price}`,
  helpMessage: `Я скачаю за вас презентацию с мудла и сделаю пдфку.\n`+
    `Внимание: презентация должна быть загружена непосредственно в мудл. Трансляцию скачать не получится xD` +
    `\n\n` +
    `1. В открытой big blue button лекции нажмите правой кнопкой мыши на слайде и нажмите "Просмотреть код"\n` +
    `2. Скопируйте ссылку вида https://bbb14.edu.vsu.ru/bigbluebutton/presentation/.../svg/228 и отправьте боту\n` +
    `3. Подождите, пока пдф сгенерируется. Файл будет отправлен через некоторое время`
};