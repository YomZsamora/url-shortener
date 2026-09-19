jest.mock('../../repositories/link-repository');
const linkRepository = require('../../repositories/link-repository');
const { generateUniqueCode } = require('../../utils/code-generator');

describe('generateUniqueCode', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns a code of the correct length when no collision', async () => {
        linkRepository.findByCode.mockResolvedValue(null);
        const code = await generateUniqueCode();
        expect(code).toHaveLength(7);
        expect(linkRepository.findByCode).toHaveBeenCalledTimes(1);
    });

    it('retries on collision and returns a code on the second attempt', async () => {
        linkRepository.findByCode
            .mockResolvedValueOnce({ code: 'abc1234' })
            .mockResolvedValue(null);
        const code = await generateUniqueCode();
        expect(code).toHaveLength(7);
        expect(linkRepository.findByCode).toHaveBeenCalledTimes(2);
    });

    it('throws after all retries are exhausted', async () => {
        linkRepository.findByCode.mockResolvedValue({ code: 'anything' });
        await expect(generateUniqueCode()).rejects.toThrow(
            'Failed to generate a unique short code after max retries'
        );
    });
});
