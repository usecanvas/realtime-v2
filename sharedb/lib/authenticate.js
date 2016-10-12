const Bluebird = require('bluebird');
const Erlang = Bluebird.promisifyAll(require('erlang_js').Erlang);
const cookie = require('cookie');
const crypto = Bluebird.promisifyAll(require('crypto'));

const { SECRET_KEY_BASE, SIGNING_SALT } = process.env;

exports.authenticate = authenticate;
exports.getAccountID = getAccountID;

function authenticate(req, cb) {
  getAccountID(req)
    .then(accountID => {
      req.agent.stream.ws.accountID = accountID;
      cb();
    })
    .catch(cb);
}

function getAccountID(req) {
  return crypto.pbkdf2Async(SECRET_KEY_BASE, SIGNING_SALT, 1000, 32, 'sha256')
    .then(key => {
      const upgradeCookie = req.agent.stream.ws.upgradeReq.headers.cookie;
      return validateCookie(upgradeCookie, key);
    }).then(payloadBinary => {
      return extractUserID(payloadBinary);
    });
}

function extractUserID(payloadBinary) {
  return Erlang.binary_to_termAsync(payloadBinary).then(({ value }) => {
    return value[Object.keys(value)[0]].value.toString();
  });
}

function validateCookie(upgradeCookie, key) {
  const apiCookie = cookie.parse(upgradeCookie)._canvas_pro_api_key;
  const [algoName, payload, signature] = apiCookie.split('.');
  const plainText = `${algoName}.${payload}`;
  const challenge = crypto.createHmac('sha256', key);
  challenge.update(plainText);

  if (crypto.timingSafeEqual(challenge.digest(),
                             Buffer.from(signature, 'base64'))) {
    return new Buffer(payload, 'base64');
  } else {
    throw new Error('invalid session cookie');
  }
}
