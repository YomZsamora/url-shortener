const { Router } = require('express');
const {
    createLink,
    listLinks,
    getLink,
    updateLink,
    deleteLink,
} = require('../controllers/links-controller');
const {
    createLinkMiddlewares,
    updateLinkMiddlewares,
    listLinksMiddlewares,
} = require('../middlewares/links-middlewares');

const router = Router();

router.get('/', listLinksMiddlewares, listLinks);
router.post('/', createLinkMiddlewares, createLink);
router.get('/:code', getLink);
router.patch('/:code', updateLinkMiddlewares, updateLink);
router.delete('/:code', deleteLink);

module.exports = router;
