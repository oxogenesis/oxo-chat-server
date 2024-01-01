const oxoKeyPairs = require("oxo-keypairs")

//config
const ServerURL = "ws://127.0.0.1:8000"
// const ServerURL = "wss://ru.oxo-chat-server.com"
const Seed = "your_seed"
// const Seed = "x5ChjcMhWEX4EuWmnxhrKJredj3PP"

const SelfURL = "ws://127.0.0.1:5000"

//const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

//keep alive
process.on('uncaughtException', function (err) {
  //打印出错误
  console.log(err)
  //打印出错误的调用栈方便调试
  console.log(err.stack)
})

//json
const Schema = require('./schema.js')

function cloneJson(json) {
  return JSON.parse(JSON.stringify(json))
}

function toSetUniq(arr) {
  return Array.from(new Set(arr))
}

//ws
const WebSocket = require('ws')
let ws = null

function connect() {
  ws = new WebSocket(ServerURL)
  ws.on('open', function open() {
    console.log(`connected...`)
    ws.send(genDeclare())
  })

  ws.on('message', function incoming(message) {
    // console.log('')
    // console.log(message)
    // console.log('')
    handleMessage(message)
  })

  ws.on('close', function close() {
    console.log(`disconnected...`)
  })
}

function sendMessage(msg) {
  if (ws != null && ws.readyState == WebSocket.OPEN) {
    ws.send(msg)
  } else {
    connect()
  }
}

connect()

//crypto
const Crypto = require('crypto')

function hasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512")
  sha512.update(str)
  return sha512.digest('hex')
}

function halfSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 64)
}

function quarterSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 32);
}

//oxo

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

function sign(msg, sk) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

function verifySignature(msg, sig, pk) {
  let hexStrMsg = strToHex(msg)
  try {
    return oxoKeyPairs.verify(hexStrMsg, sig, pk)
  } catch (e) {
    return false
  }
}

function VerifyJsonSignature(json) {
  let sig = json["Signature"]
  delete json["Signature"]
  let tmpMsg = JSON.stringify(json)
  if (verifySignature(tmpMsg, sig, json.PublicKey)) {
    json["Signature"] = sig
    return true
  } else {
    console.log('signature invalid...')
    return false
  }
}

let ActionCode = {
  "Declare": 100,
  "ObjectResponse": 101,

  "BulletinRandom": 200,
  "BulletinRequest": 201,
  "BulletinFileRequest": 202,
  "BulletinAddressListRequest": 203,
  "BulletinAddressListReponse": 204,
  "BulletinReplyListRequest": 205,
  "BulletinReplyListReponse": 206,

  "ChatDH": 301,
  "ChatMessage": 302,
  "ChatSync": 303,
  "PrivateFileRequest": 304,

  "GroupRequest": 401,
  "GroupManageSync": 402,
  "GroupDH": 403,
  "GroupMessageSync": 404,
  "GroupFileRequest": 405
}

//message
const MessageCode = {
  "JsonSchemaInvalid": 0, //json schema invalid...
  "SignatureInvalid": 1, //signature invalid...
  "TimestampInvalid": 2, //timestamp invalid...
  "BalanceInsufficient": 3, //balance insufficient...
  "NewConnectionOpening": 4, //address changed...
  "AddressChanged": 5, //new connection with same address is opening...
  "ToSelfIsForbidden": 6, //To self is forbidden...
  "ToNotExist": 7, //To not exist...

  "GatewayDeclareSuccess": 1000 //gateway declare success...
}

const ObjectType = {
  "Bulletin": 101,
  "BulletinFile": 102,

  "PrivateFile": 201,

  "GroupManage": 301,
  "GroupMessage": 302,
  "GroupFile": 303
}

const sqlite3 = require('sqlite3')

let DB = null
let BulletinCount = 0
let PageSize = 10
let PageCount = BulletinCount / PageSize
let PageLinks = ''

let BulletinAccounts = []

function initDB() {
  //建库：数据库名为账号地址
  DB = new sqlite3.Database(`./cache.db`)
  //建表
  DB.serialize(() => {
    //为账号地址起名
    DB.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
            hash VARCHAR(32) PRIMARY KEY,
            pre_hash VARCHAR(32),
            next_hash VARCHAR(32),
            address VARCHAR(35) NOT NULL,
            sequence INTEGER NOT NULL,
            content TEXT NOT NULL,
            quote TEXT NOT NULL,
            json TEXT NOT NULL,
            signed_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL)`, err => {
      if (err) {
        console.log(err)
      }
    })

    DB.run(`CREATE TABLE IF NOT EXISTS QUOTES(
      main_hash VARCHAR(32) NOT NULL,
      quote_hash VARCHAR(32) NOT NULL,
      address VARCHAR(35) NOT NULL,
      sequence INTEGER NOT NULL,
      content TEXT NOT NULL,
      signed_at INTEGER NOT NULL,
      PRIMARY KEY ( main_hash, quote_hash ) )`, err => {
      if (err) {
        console.log(err)
      }
    })
  })

  let SQL = `SELECT * FROM BULLETINS ORDER BY created_at DESC`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      BulletinCount = items.length
      PageCount = BulletinCount / PageSize + 1
      PageLinks = ''
      let PageLinkArray = []
      if (PageCount > 1) {
        for (let i = 1; i <= PageCount; i++) {
          PageLinkArray.push(`<a href="/bulletins?page=${i}">${i}</a>`)
        }
        PageLinks = PageLinkArray.join(' ')
      }
    }
  })

  SQL = `SELECT * FROM BULLETINS GROUP BY address`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      for (let i = 0; i < items.length; i++) {
        BulletinAccounts.push({ 'address': items[i].address, 'sequence': 0 })
      }
    }
  })
}

initDB()

////////hard copy from client<<<<<<<<
const crypto = require("crypto")

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
const PublicKey = keypair.publicKey
const PrivateKey = keypair.privateKey

console.log(`use account: ${Address}`)

function sign(msg, sk) {
  let msgHexStr = strToHex(msg);
  let sig = oxoKeyPairs.sign(msgHexStr, sk);
  return sig;
}

function signJson(json) {
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  return json
}

function genDeclare() {
  let json = {
    "Action": ActionCode.Declare,
    "Timestamp": new Date().getTime(),
    "PublicKey": PublicKey
  }
  return JSON.stringify(signJson(json))
}

function genObjectResponse(object, to) {
  let json = {
    "Action": ActionCode.ObjectResponse,
    "Object": object,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey,
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function genBulletinRequest(address, sequence, to) {
  let json = {
    "Action": ActionCode.BulletinRequest,
    "Address": address,
    "Sequence": sequence,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  return JSON.stringify(signJson(json))
}

function genBulletinJson(sequence, pre_hash, quote, content, timestamp) {
  let json = {
    "ObjectType": ObjectType.Bulletin,
    "Sequence": sequence,
    "PreHash": pre_hash,
    "Quote": quote,
    "Content": content,
    "Timestamp": timestamp,
    "PublicKey": PublicKey
  }
  return signJson(json)
}

function genBulletinAddressListRequest(page) {
  let json = {
    "Action": ActionCode.BulletinAddressListRequest,
    "Page": page,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  return signJson(json)
}

function genBulletinReplyListRequest(hash, page) {
  let json = {
    "Action": ActionCode.BulletinReplyListRequest,
    "Hash": hash,
    "Page": page,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  return signJson(json)
}

function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = quarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)
  //console.log(hash)
  let SQL = `INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, quote, json, signed_at, created_at)
            VALUES ('${hash}', '${bulletin.PreHash}', '${address}', '${bulletin.Sequence}', '${bulletin.Content}', '${JSON.stringify(bulletin.Quote)}', '${JSON.stringify(bulletin)}', ${bulletin.Timestamp}, ${timestamp})`
  DB.run(SQL, err => {
    if (err) {
      console.log(err)
    } else {
      BulletinCount = BulletinCount + 1
      PageCount = BulletinCount / PageSize + 1
      PageLinks = ''
      let PageLinkArray = []
      if (PageCount > 1) {
        for (let i = 1; i <= PageCount; i++) {
          PageLinkArray.push(`<a href="/bulletins?page=${i}">${i}</a>`)
        }
        PageLinks = PageLinkArray.join(' ')
      }

      //update account sequence
      for (let i = 0; i < BulletinAccounts.length; i++) {
        if (BulletinAccounts[i].address == address && BulletinAccounts[i].sequence < bulletin.sequence) {
          BulletinAccounts[i].sequence = bulletin.sequence
        }
      }
      console.log(`CacheBulletin:${address}#${bulletin.Sequence}`)
    }
  })
}

function handleMessage(message) {
  let json = JSON.parse(message)
  console.log(json)
  if (json["To"] != null) {
    //cache bulletin
    if (json["Action"] == ActionCode["ObjectResponse"] && json["Object"]["ObjectType"] == ObjectType["Bulletin"]) {
      //console.log(`###################LOG################### Client Message:`)
      //console.log(message)
      CacheBulletin(json["Object"])
    }
  } else if (json["ObjectType"] == ObjectType.Bulletin) {
    CacheBulletin(json)
  }

  if (json["Action"] == ActionCode["BulletinRequest"]) {
    //send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json["Address"]}" AND sequence = "${json["Sequence"]}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        console.log(`>server request #${json.Sequence}`)
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
          let bulletin_json = JSON.parse(item.json)
          let msg = genObjectResponse(bulletin_json, address)
          sendMessage(msg)
          console.log(`<done`)
        } else {
          SQL = `SELECT * FROM BULLETINS WHERE address = "${json["Address"]}" ORDER BY sequence DESC LIMIT 1`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              let local_seq = 0
              if (item != null) {
                local_seq = item.sequence
              }
              console.log(`=local sequence is #${local_seq}`)
              if (local_seq < json.Sequence - 1) {
                let msg = genBulletinRequest(Address, local_seq + 1, Address)
                sendMessage(msg)
              }
            }
          })
        }
      }
    })
  } else if (json["To"] == Address && json["Action"] == ActionCode["ObjectResponse"] && json["Object"]["ObjectType"] == ObjectType["Bulletin"]) {
    CacheBulletin(json["Object"])
    //fetch more bulletin
    let msg = genBulletinRequest(Address, json["Object"].Sequence + 1, Address)
    sendMessage(msg)
  }
}
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++控制台
const fs = require("fs")
const readline = require('readline')
const rl = readline.createInterface(process.stdin, process.stdout)

rl.on('line', function (line) {
  line = line.trim()
  let timestamp = Date.now()
  if (line == 'go') {
    fs.readFile(`./new_bulletin.txt`, 'utf8', (err, content) => {
      if (err) {
        console.log(err)
      } else {
        SQL = `SELECT * FROM BULLETINS WHERE address = '${Address}' ORDER BY sequence DESC`
        DB.get(SQL, (err, b) => {
          if (err) {
            console.log(err)
          } else {
            let bulletin = null
            if (b != null) {
              if (content == b.content) {
                console.log(`!!!same content, please check again`)
                // console.log(content)
                rl.close()
              }
              bulletin = genBulletinJson(b.sequence + 1, b.hash, [], content, timestamp)
            } else {
              bulletin = genBulletinJson(1, GenesisHash, [], content, timestamp)
            }
            CacheBulletin(bulletin)
          }
        })
      }
    })
  } else if (line == 'test') {
    // let msg = genBulletinAddressListRequest(1)
    let msg = genBulletinReplyListRequest("E0E219FEDB8C1EB1399EF19FF8357561", 1)
    console.log(msg)
    sendMessage(JSON.stringify(msg))
  } else if (line == 'close') {
    rl.close()
  } else {
    console.log('没有找到命令！')
  }
})

rl.on('close', function () {
  console.log('bye bye!')
  process.exit(0)
})

//start web server
const http = require('http')
const url = require("url")

const bulletins_reg = /^\/bulletins\?page=\d+/
const bulletin_reg = /^\/bulletin\/[0123456789ABCDEF]{32}$/
const bulletin_json_reg = /^\/bulletin\/[0123456789ABCDEF]{32}\/json$/
const account_bulletins_reg = /^\/account\/o[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,33}\/bulletins/
const account = /^o[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,33}\//

function add0(m) { return m < 10 ? '0' + m : m }

function timestamp_format(timestamp) {
  var time = new Date(timestamp);
  var y = time.getFullYear();
  var m = time.getMonth() + 1;
  var d = time.getDate();
  var h = time.getHours();
  var mm = time.getMinutes();
  var s = time.getSeconds();
  return y + '-' + add0(m) + '-' + add0(d) + ' ' + add0(h) + ':' + add0(mm) + ':' + add0(s);
}

http.createServer(function (request, response) {
  let path = url.parse(request.url).path;
  if (path == "/") {
    response.writeHeader(200, {
      "Content-Type": "text/html"
    });
    response.write(`
            <!DOCTYPE html>
            <html>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
            <head>
              <title>oxo-chat-server</title>
            </head>
            <body bgcolor="#8FBC8F">
              <h1><a href="/bulletins">公告列表</a></h1>
              <h1><a href="/accounts">作者列表</a></h1>
              <h2><a href="https://github.com/oxogenesis/oxo-chat-server#deploy-with-ssl-nginx-pm2">自建/搭建本站教程</a></h2>
              <h2><a href="https://github.com/oxogenesis/oxo-chat-app/releases">App下载（on android推荐）</a></h2>
              <h2><a href="https://github.com/oxogenesis/oxo-chat-client/releases">Client下载（electron on windows不推荐）</a></h2>
              <h2>本站服务地址：${SelfURL}</h2>
              <h2>本站服务账号：${Address}</h2>
              <h3>{"URL": "${SelfURL}", "Address": "${Address}"}</h3>
            </body>
            </html>
            `);
    response.end();
  } else if (path == "/bulletins" || bulletins_reg.test(path)) {
    let page = 1
    if (path != "/bulletins") {
      page = ~~path.replace(/^\/bulletins\?page=/, '')
    }
    let SQL = `SELECT * FROM BULLETINS ORDER BY created_at DESC LIMIT ${PageSize} OFFSET ${(page - 1) * PageSize}`
    DB.all(SQL, (err, bulletins) => {
      if (err) {
        console.log(err)
      } else {
        let trs = ''
        bulletins.forEach(bulletin => {
          let title = bulletin.content.slice(0, 32).trim()
          trs = trs +
            `<tr>
            <td><a href="/account/${bulletin.address}/bulletins">${bulletin.address}</a></td>
            <td>${bulletin.sequence}</td>
            <td><a href="/bulletin/${bulletin.hash}">${title}</a></td>
            <td>${timestamp_format(bulletin.created_at)}</td>
          </tr>`
        })
        response.writeHeader(200, {
          "Content-Type": "text/html"
        });
        response.write(`
          <!DOCTYPE html>
          <html>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <head>
            <title>oxo-chat-server</title>
          </head>
          <body bgcolor="#8FBC8F">
            <h1>公告列表</h1>
            <table border="1">
              <tr>
                <th>作者</th>
                <th>序号</th>
                <th>标题</th>
                <th>时间</th>
              </tr>
              ${trs}
            </table>
            ${PageLinks}
          </body>
          </html>
          `);
        response.end();
      }
    })
  } else if (bulletin_reg.test(path)) {
    let hash = path.replace(/^\/bulletin\//, '')
    let SQL = `SELECT * FROM BULLETINS WHERE hash = "${hash}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        if (item == null) {
          response.writeHeader(200, {
            "Content-Type": "text/html"
          });
          response.write(`
            <!DOCTYPE html>
            <html>
              <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
              <head>
                <title>oxo-chat-server</title>
              </head>
              <body bgcolor="#8FBC8F">
                <h1><a href="/bulletins">公告列表</a></h1>
                <h1>Bulletin#${hash}</h1>
                <h1>未被缓存...</h1>
              </body>
            </html>
            `)
          response.end();
        } else {
          let content = item.content.replace(/\n/g, '<br>')
          let quote = ''
          let quotes = JSON.parse(item.quote)
          if (quotes.length != '') {
            quote = '<h3>引用</h3><ul>'
            for (let i = quotes.length - 1; i >= 0; i--) {
              quote = quote + `<li><a href="/bulletin/${quotes[i].Hash}">${quotes[i].Address}#${quotes[i].Sequence}</a></li>`
            }
            quote = quote + '</ul><hr>'
          }

          let pre_bulletin = ''
          if (item.pre_hash != 'F4C2EB8A3EBFC7B6D81676D79F928D0E') {
            pre_bulletin = `<h3><a href="/bulletin/${item.pre_hash}">上一篇</a></h3>`
          }
          let next_bulletin = ""
          if (item.next_hash != null) {
            next_bulletin = `<h3><a href="/bulletin/${item.next_hash}">下一篇</a></h3>`
          }

          SQL = `SELECT * FROM QUOTES WHERE main_hash = "${hash}" ORDER BY signed_at ASC`
          DB.all(SQL, (err, is) => {
            if (err) {
              console.log(err)
            } else {
              let replys = ''
              is.forEach(i => {
                replys = replys + `<hr>
                <h4><a href="/bulletin/${i.quote_hash}">Bulletin#${i.quote_hash}</a></h4>
                <h4><a href="/account/${i.address}/bulletins">${i.address}</a>
                <a href="/bulletin/${i.quote_hash}/json">#${i.sequence}</a></h4>
                <h4> 发布@${timestamp_format(i.signed_at)}</h4>
                <h4>${i.content}</h4>`
              });
              response.writeHeader(200, {
                "Content-Type": "text/html"
              });
              response.write(`
                <!DOCTYPE html>
                <html>
                  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
                  <head>
                    <title>oxo-chat-server</title>
                  </head>
                  <body bgcolor="#8FBC8F">
                    <h1><a href="/bulletins">公告列表</a></h1>
                    <h1>Bulletin#${hash}</h1>
                    ${quote}
                    <h3><a href="/account/${item.address}/bulletins">${item.address}</a>
                    <a href="/bulletin/${hash}/json">#${item.sequence}</a></h3>
                    <h3> 发布@${timestamp_format(item.signed_at)}</h3>
                    ${pre_bulletin}${next_bulletin}
                    <h3>${content}</h3>
                    ${replys}
                  </body>
                </html>
                `);
              response.end();
            }
          })
        }
      }
    })
  } else if (path == "/accounts") {
    let trs = ''
    for (let i = 0; i < BulletinAccounts.length; i++) {
      trs = trs +
        `<tr>
        <td><li><a href="/account/${BulletinAccounts[i].address}/bulletins"><code>${BulletinAccounts[i].address}</code></a></td>
        <td>${BulletinAccounts[i].sequence}</td>
      </tr>`
    }
    response.writeHeader(200, {
      "Content-Type": "text/html"
    });
    response.write(`
      <!DOCTYPE html>
      <html>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <head>
        <title>oxo-chat-server</title>
      </head>
      <body bgcolor="#8FBC8F">
        <h1>作者列表</h1>
        <table border="1">
          <tr>
            <th>作者</th>
            <th>公告数量</th>
          </tr>
          ${trs}
        </table>
      </body>
      </html>
      `);
    response.end();
  } else if (account_bulletins_reg.test(path)) {
    let address = path.replace('/account/', '')
    address = address.replace('/bulletins', '')
    let SQL = `SELECT * FROM BULLETINS WHERE address = '${address}' ORDER BY sequence DESC`
    DB.all(SQL, (err, bulletins) => {
      if (err) {
        console.log(err)
      } else {
        //update account sequence
        let sequence = 0
        if (bulletins.length > 0) {
          sequence = bulletins[0].sequence
        }
        for (let i = 0; i < BulletinAccounts.length; i++) {
          if (BulletinAccounts[i].address == address && BulletinAccounts[i].sequence < sequence) {
            BulletinAccounts[i].sequence = sequence
          }
        }

        let trs = ''
        bulletins.forEach(bulletin => {
          let title = bulletin.content.slice(0, 32).trim()
          trs = trs +
            `<tr>
            <td>${bulletin.address}</td>
            <td>${bulletin.sequence}</td>
            <td><a href="/bulletin/${bulletin.hash}">${title}</a></td>
            <td>${timestamp_format(bulletin.created_at)}</td>
          </tr>`
        })
        response.writeHeader(200, {
          "Content-Type": "text/html"
        });
        response.write(`
          <!DOCTYPE html>
          <html>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <head>
            <title>oxo-chat-server</title>
          </head>
          <body bgcolor="#8FBC8F">
            <h1>公告列表</h1>
            <table border="1">
              <tr>
                  <th>作者</th>
                  <th>序号</th>
                  <th>标题</th>
                  <th>时间</th>
              </tr>
              ${trs}
            </table>
          </body>
          </html>
          `);
        response.end();
      }
    })
  } else if (bulletin_json_reg.test(path)) {
    let hash = path.replace(/^\/bulletin\//, '')
    hash = hash.replace(/\/json/, '')
    let SQL = `SELECT * FROM BULLETINS WHERE hash = "${hash}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        if (item == null) {
          response.writeHeader(200, {
            "Content-Type": "text/html"
          });
          response.write(`
            <!DOCTYPE html>
            <html>
              <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
              <head>
                <title>oxo-chat-server</title>
              </head>
              <body bgcolor="#8FBC8F">
                <h1><a href="/bulletins">公告列表</a></h1>
                <h1>Bulletin#${hash}</h1>
                <h1>未被缓存...</h1>
              </body>
            </html>
            `)
          response.end();
        } else {
          response.writeHeader(200, {
            "Content-Type": "application/json; charset=utf-8"
          });
          response.write(`${item.json}`);
          response.end();
        }
      }
    })
  } else {
    response.writeHeader(404, {
      "Content-Type": "text/html"
    });
    response.end();
  }
})
  .listen(8080);