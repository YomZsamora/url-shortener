const config = require('../configs/config');
const { customAlphabet } = require('nanoid');
const linkRepository = require('../repositories/link-repository');

const nanoid = customAlphabet(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    config.app.CODE_LENGTH
);

const generateUniqueCode = async () => {
    for (let attempt = 0; attempt < config.app.CODE_MAX_RETRIES; attempt++) {
        const code = nanoid();
        const exists = await linkRepository.findByCode(code);
        if (!exists) return code;
    }
    throw new Error('Failed to generate a unique short code after max retries');
};

module.exports = { generateUniqueCode };
