const validator = require('validator');
const { MIN_PASSWORD_LENGTH, loginUrlOf } = require('./accounts');

const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;background:#f6f6f4;color:#15191c;font:16px/1.6 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif}
main{width:100%;max-width:400px;padding:28px 24px;background:#fff;border:1px solid #e4e5e2;border-radius:12px}
h1{margin:0 0 8px;font-size:22px;line-height:1.3}
p{margin:0 0 16px;color:#4d5357}
label{display:block;margin-bottom:6px;font-weight:600}
input{width:100%;min-height:46px;margin-bottom:16px;padding:10px 12px;border:1px solid #c9cdca;border-radius:8px;font:inherit;background:#fff;color:inherit}
button,.link{display:block;width:100%;min-height:46px;padding:11px 16px;border:0;border-radius:8px;background:#0085a3;color:#fff;font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
.problem{padding:10px 12px;border-radius:8px;background:#fdf1ed;color:#a63d1c}
`;

const escape = (value) => validator.escape(String(value ?? ''));

const page = (title, body) => `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} - 6yuwei</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;

const backLink = (app) => `<a class="link" href="${escape(loginUrlOf(app))}">回到登入</a>`;

const invalidLink = (app) => page('連結無法使用', `
<h1>連結無法使用</h1>
<p>這個連結已經用過或已過期。請重新申請重設密碼。</p>
${backLink(app)}`);

const passwordFields = (token, problem) => `
${problem ? `<p class="problem" role="alert">${escape(problem)}</p>` : ''}
<form method="post">
<input type="hidden" name="token" value="${escape(token)}">
<label for="password">新密碼</label>
<input id="password" name="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required autofocus>
<button type="submit">設定新密碼</button>
</form>`;

const resetForm = (token, problem) => page('重設密碼', `
<h1>重設密碼</h1>
<p>密碼至少 ${MIN_PASSWORD_LENGTH} 個字元。設定後，其他裝置都要重新登入。</p>
${passwordFields(token, problem)}`);

const resetDone = (app) => page('密碼已更新', `
<h1>密碼已更新</h1>
<p>請用新密碼登入。</p>
${backLink(app)}`);

const forgotForm = (app) => page('忘記密碼', `
<h1>忘記密碼</h1>
<p>輸入帳號的信箱，我們會寄出重設連結。用 Google 註冊的帳號也可以用這個方式設定密碼。</p>
<form method="post">
<input type="hidden" name="app" value="${escape(app)}">
<label for="email">電子郵件</label>
<input id="email" name="email" type="email" autocomplete="email" autocapitalize="none" required autofocus>
<button type="submit">寄出重設連結</button>
</form>`);

const forgotSent = (app) => page('請查看信箱', `
<h1>請查看信箱</h1>
<p>如果這個信箱有帳號，重設連結會在幾分鐘內寄達，1 小時內有效。也請查看垃圾信件匣。</p>
${backLink(app)}`);

module.exports = {
  forgotForm,
  forgotSent,
  invalidLink,
  resetDone,
  resetForm,
};
