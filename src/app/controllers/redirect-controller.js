const logger = require('../../utils/logger');
const cacheService = require('../../services/cache-service');
const linkRepository = require('../../repositories/link-repository');
const clickRepository = require('../../repositories/click-repository');
const { NotFound, Gone } = require('../../utils/exceptions/custom-exceptions');

const redirect = async (req, res) => {
    
    const { code } = req.params;
    const start = Date.now();

    const cached = await cacheService.getLink(code);

    if (cached) {
        if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
            await cacheService.deleteLink(code);
            logger.warn('Redirect — expired link (cache hit)', { code });
            throw new Gone('This link has expired and is no longer active.');
        }

        logger.info('Redirect — cache hit', { code, cacheHit: true, responseTime: Date.now() - start });
        res.setHeader('Cache-Control', 'no-store');
        res.redirect(cached.redirectType, cached.originalUrl);

        setImmediate(() => {
            clickRepository.create({
                linkId: cached.id,
                clickedAt: new Date(),
                ipAddress: req.ip || null,
                userAgent: req.headers['user-agent'] || null,
                referrer: req.headers['referer'] || null,
            }).catch(err => logger.error('Async click write failed', { linkId: cached.id, error: err.message }));

            linkRepository.incrementClickCount(cached.id)
                .catch(err => logger.error('Async click_count increment failed', { linkId: cached.id, error: err.message }));
        });

        return;
    }

    const link = await linkRepository.findByCode(code);
    if (!link) throw new NotFound('Link not found.');

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        logger.warn('Redirect — expired link (cache miss)', { code });
        throw new Gone('This link has expired and is no longer active.');
    }

    await cacheService.setLink(code, {
        id: link.id,
        originalUrl: link.originalUrl,
        redirectType: link.redirectType,
        expiresAt: link.expiresAt,
    });

    logger.info('Redirect — cache miss', { code, cacheHit: false, responseTime: Date.now() - start });
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(link.redirectType, link.originalUrl);

    setImmediate(() => {
        clickRepository.create({
            linkId: link.id,
            clickedAt: new Date(),
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            referrer: req.headers['referer'] || null,
        }).catch(err => logger.error('Async click write failed', { linkId: link.id, error: err.message }));

        linkRepository.incrementClickCount(link.id)
            .catch(err => logger.error('Async click_count increment failed', { linkId: link.id, error: err.message }));
    });
};

module.exports = { redirect };
