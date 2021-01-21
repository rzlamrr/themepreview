const token = process.env.TOKEN;

const Telegraf = require(`telegraf`);
const bot = new Telegraf(token);
const request = require(`request-promise`);
const atthemeEditorApi = require(`attheme-editor-api`);
const render = require(`./render-pool`);
const path = require(`path`);
const {
    MINIMALISTIC_TEMPLATE,
    REGULAR_TEMPLATE,
    NEW_TEMPLATE,
    DESKTOP_TEMPLATE,
} = require(`./preview-maker`);
const RESEND_ON_ERRORS = [`RequestError`, `FetchError`];

bot.context.downloadFile = async function (fileId) {
    if (!fileId) {
        fileId = this.callbackQuery.message.reply_to_message.document.file_id;
    }

    const file = await bot.telegram.getFile(fileId);
    const fileContent = await request({
        encoding: null,
        uri: `http://api.telegram.org/file/bot${token}/${file.file_path}`,
    });

    return fileContent;
};

const handleStart = async (context) => {
    const id = context.message.text.slice(`/start `.length).trim();

    if (id.length === 0) {
        await context.reply(
            `Send me an .attheme or a .tdesktop-theme file to create its preview. Don't forget to follow @TgramTheming`
        );

        return;
    }
    const { name, theme } = await atthemeEditorApi.downloadTheme(id);
    const preview = await render({
        theme,
        name,
        template: NEW_TEMPLATE,
    });

    const sendPreview = async () => {
        try {
            await context.replyWithPhoto(
                { source: preview },
                {
                    reply_to_message_id: context.message.message_id,
                    caption: `${name}\nCreated by @TgThemePreview_bot`,
                }
            );
        } catch (error) {
            if (RESEND_ON_ERRORS.includes(error)) {
                process.nextTick(sendPreview);
            } else {
                console.error(error);
            }
        }
    };

    sendPreview();
};
const choose = async (context) => {
    const fileName = context.message.document.file_name;

    if (!fileName) {
        return;
    }
    const extenstion = path.extname(fileName);
    const name = path.basename(fileName, extenstion);

    if (![`.attheme`, `.tdesktop-theme`].includes(extenstion)) {
        return;
    }
    const isAttheme = extenstion === `.attheme`;

    if (
        isAttheme &&
    ![`group`, `supergroup`].includes(context.message.chat.type)
    ) {
        context.reply(`Select the style`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `Ordinary`,
                            callback_data: `ordinary` },
                        { text: `Minimalistic`,
                            callback_data: `minimalistic` },
                    ],
                ],
            },
            reply_to_message_id: context.message.message_id,
        });

        return;
    }

    bot.telegram.sendChatAction(context.message.chat.id, `upload_photo`);
    let template = DESKTOP_TEMPLATE;
    let reply_markup = {};

    if (isAttheme) {
        template = REGULAR_TEMPLATE;
        reply_markup = {
            inline_keyboard: [
                [
                    { text: `Minimalistic`,
                        callback_data: `minimalistic` },
                ],
            ],
        };
    }
    const theme = await context.downloadFile(context.message.document.file_id);
    const preview = await render({
        theme,
        name,
        template,
    });
    const sendPreview = async () => {
        try {
            await context.replyWithPhoto(
                { source: preview },
                {
                    // eslint-disable-next-line camelcase
                    reply_to_message_id: context.message.message_id,
                    reply_markup,
                    caption: isAttheme
                        ? `Created by @TgThemePreview_bot`
                        : `Design by @TgramTheming`,
                }
            );
        } catch (error) {
            if (RESEND_ON_ERRORS.includes(error.name)) {
                process.nextTick(sendPreview);
            } else {
                console.error(error);
            }
        }
    };

    sendPreview();
};

const handleDocument = async (context) => {
    const { callbackQuery } = context;
    const callbackMessage = callbackQuery.message;

    if (callbackMessage.text == `Select the style`) {
        context.deleteMessage(callbackMessage.message_id);
    } else {
        bot.telegram.editMessageCaption(
            callbackMessage.chat.id,
            callbackMessage.message_id,
            callbackMessage.message_id,
            `Updating the preview...`
        );
    }
    bot.telegram.sendChatAction(callbackMessage.chat.id, `upload_photo`);
    const fileName = callbackMessage.reply_to_message.document.file_name;
    const theme = await context.downloadFile();
    const preview = await render({
        theme,
        name: fileName.replace(`.attheme`, ``),
        template:
      callbackQuery.data == `ordinary`
          ? REGULAR_TEMPLATE
          : MINIMALISTIC_TEMPLATE,
    });
    const sendPreview = async () => {
        const reply_markup = {
            inline_keyboard: [
                [
                    {
                        text:
              callbackQuery.data == `ordinary` ? `Minimalistic` : `Ordinary`,
                        callback_data:
              callbackQuery.data == `ordinary` ? `minimalistic` : `ordinary`,
                    },
                ],
            ],
        };
        const caption =
      callbackQuery.data == `minimalistic`
          ? `Design by @TgramTheming`
          : `Created by @TgThemePreview_bot`;

        try {
            if (callbackMessage.text == `Select the style`) {
                await context.replyWithPhoto(
                    { source: preview },
                    {
                        reply_to_message_id: callbackMessage.reply_to_message.message_id,
                        reply_markup,
                        caption,
                    }
                );
            } else {
                await context.editMessageMedia(
                    { type: `photo`,
                        media: { source: preview },
                        caption },
                    { reply_markup }
                );
            }
        } catch (error) {
            if (RESEND_ON_ERRORS.includes(error.name)) {
                process.nextTick(sendPreview);
            } else {
                console.error(error);
            }
        }
    };

    sendPreview();
};

bot.start((context) => {
    handleStart(context);
});

bot.help((context) => {
    context.reply(`Send me an .attheme file to create its preview. Don't forget to follow @TgramTheming`);
});

bot.on(`document`, (context) => {
    choose(context);
});

bot.action([`ordinary`, `minimalistic`], (context) => {
    handleDocument(context);
});

bot.polling.offset = -100;
bot.startPolling();
