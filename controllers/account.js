const accounts = require('../services/accounts');
const pages = require('../services/accountPages');

const refuseLink = (req, res) => res
  .status(400)
  .send(pages.invalidLink(accounts.appOf(req.query.app)));

const resetPage = (req, res) => res.send(pages.resetForm(req.query.token));

const reset = async (req, res) => {
  const { token, password } = req.body;
  const { error, app } = await accounts.resetPassword(token, password);
  if (error === 'invalid-link') return refuseLink(req, res);
  if (error) {
    const problem = `密碼至少要 ${accounts.MIN_PASSWORD_LENGTH} 個字元，且不能超過 72 個位元組。`;
    return res.status(400).send(pages.resetForm(token, problem));
  }
  return res.send(pages.resetDone(app));
};

const forgotPage = (req, res) => res.send(pages.forgotForm(accounts.appOf(req.query.app)));

const forgot = async (req, res) => {
  const app = accounts.appOf(req.body.app);
  await accounts.requestPasswordReset(req.body.email, app);
  return res.send(pages.forgotSent(app));
};

module.exports = {
  forgot,
  forgotPage,
  reset,
  resetPage,
};
