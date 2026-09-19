const { Router } = require('express');
const { createLink } = require('../controllers/links-controller');
const { createLinkMiddlewares } = require('../middlewares/links-middlewares');

const router = Router();

router.post('/', createLinkMiddlewares, createLink);

module.exports = router;
