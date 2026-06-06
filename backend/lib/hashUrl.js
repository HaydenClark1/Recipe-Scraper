const crypto = require('crypto')

function hashUrl(url) {
  return crypto.createHash('sha256').update(String(url)).digest('hex')
}

module.exports = { hashUrl }
