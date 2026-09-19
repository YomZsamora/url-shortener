const { Router } = require('express');
const { redirect } = require('../controllers/redirect-controller');

const router = Router();

router.get('/:code', redirect);

module.exports = router;
