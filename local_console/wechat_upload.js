const { ConsoleInfo, ConsoleWarn, ConsoleError, ConsoleDebug, DelayExec, UniqArray, CheckServerURL } = require('./util.js')
const { ActionCode, ObjectType } = require('./oxo_const.js')
const { VerifyJsonSignature } = require('./oxo_util.js')
const { MsgValidate } = require('./msg_validator.js')

const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3')
const WebSocket = require('ws')
const oxoKeyPairs = require("oxo-keypairs")

// config
const Seed = ""

const Servers = [
  {
    URL: "wss://ru.oxo-chat-server.com",
    Address: "ospxTHwV9YJEq5g6h3MZy9ASs8EP3vY4L6"
  }
]
const SelfURL = 'ws://127.0.0.1:8000'

function addServer(address, url) {
  Servers.push({
    URL: url,
    Address: address
  })
  Servers = UniqArray(Servers)
}

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const SelfAddress = oxoKeyPairs.deriveAddress(keypair.publicKey)
const SelfPublicKey = keypair.publicKey
const SelfPrivateKey = keypair.privateKey
ConsoleInfo(`use    seed: ${Seed}`)
ConsoleInfo(`use account: ${SelfAddress}`)

let DB = new sqlite3.Database(path.resolve(`./${SelfAddress}.db`))

// keep alive
process.on('uncaughtException', function (err) {
  // 打印出错误
  ConsoleError(err)
  // 打印出错误的调用栈方便调试
  ConsoleError(err.stack)
})

// ws
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//  Server Connections
let Conns = {}

function fetchConnAddress(ws) {
  for (let address in Conns) {
    if (Conns[address] == ws) {
      return address
    }
  }
  return null
}

function teminateConn(ws) {
  ConsoleInfo(`###################LOG################### client disconnect... <>`)
  ws.close()
  let connAddress = fetchConnAddress(ws)
  if (connAddress != null) {
    ConsoleInfo(`###################LOG################### client disconnect... <${connAddress}>`)
    delete Conns[connAddress]
  }
}

function sendMessage(ws, msg) {
  if (ws != null && ws.readyState == WebSocket.OPEN) {
    ws.send(msg)
  }
}

function handleMessage(address, json) {
  // ConsoleInfo(json)
  if (json.Action == ActionCode.BulletinRequest) {
    // send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" AND sequence = "${json.Sequence}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        ConsoleError(err)
      } else {
        ConsoleInfo(`request  >>> ${json.Address}#${json.Sequence}`)
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json.PublicKey)
          let bulletin_json = JSON.parse(item.json)
          let msg = GenObjectResponse(bulletin_json, address, SelfPublicKey, SelfPrivateKey)
          sendMessage(Conns[address], msg)
          ConsoleInfo(`response <<< ${json.Address}#${json.Sequence}`)
        } else {
          ConsoleInfo(`response <<< not found...`)
        }
      }
    })
  }
}

function checkMessage(ws, message) {
  // ConsoleInfo(`###################LOG################### Client Message:`)
  // ConsoleInfo(message)
  // ConsoleInfo(`${message.slice(0, 512)}`)
  let json = MsgValidate(message)
  if (json == false) {
    // json格式不合法
    // sendServerMessage(ws, MessageCode.JsonSchemaInvalid)
    ConsoleWarn(`json格式不合法`)
    teminateConn(ws)
  } else {
    if (json.ObjectType == ObjectType.Bulletin) {
      CacheBulletin(ws, json)
      return
    }

    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    if (Conns[address] == ws) {
      // 连接已经通过"声明消息"校验过签名
      // "声明消息"之外的其他消息，由接收方校验
      // 伪造的"公告消息"无法通过接收方校验，也就无法被接受方看见（进而不能被引用），也就不具备传播能力
      // 伪造的"消息"无法通过接收方校验，也就无法被接受方看见
      // 所以服务器端只校验"声明消息"签名的有效性，并与之建立连接，后续消息无需校验签名，降低服务器运算压力
      handleMessage(address, json)
    } else {
      let connAddress = fetchConnAddress(ws)
      if (connAddress != null && connAddress != address) {
        // using different address in same connection
        // sendServerMessage(ws, MessageCode.AddressChanged)
        teminateConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          // "声明消息"签名不合法
          // sendServerMessage(ws, MessageCode.SignatureInvalid)
          teminateConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          // "声明消息"生成时间过早
          // sendServerMessage(ws, MessageCode.TimestampInvalid)
          teminateConn(ws)
          return
        }

        if (connAddress == null && Conns[address] == null) {
          // new connection and new address
          // 当前连接无对应地址，当前地址无对应连接，全新连接
          ConsoleInfo(`connection established from client <${address}>`)
          Conns[address] = ws
          if (json.ActionCode == ActionCode.Declare && CheckServerURL(json.URL)) {
            addServer(address, json.URL)
          }
          // handleMessage(message, json)

          // 获取最新bulletin
          fetchNextBulletin(ws, address)

          // 获取未缓存的bulletin文件
          fetchUnsaveFile(ws)
        } else if (Conns[address] != ws && Conns[address].readyState == WebSocket.OPEN) {
          // new connection kick old conection with same address
          // 当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          // sendServerMessage(Conns[address], MessageCode.NewConnectionOpening)
          Conns[address].close()
          Conns[address] = ws
          // handleMessage(message, json)
        } else {
          ws.send("WTF...")
          teminateConn(ws)
        }
      }
    }
  }
}

async function sendBulletins(ws) {
  for (let i = 0; i < Bulletins.length; i++) {
    const bulletin = Bulletins[i];
    await DelayExec(1000)
    sendMessage(ws, bulletin.json)
    ConsoleDebug(bulletin.json)
  }
}

function connect(server) {
  ConsoleInfo(`--------------------------connect to server--------------------------`)
  ConsoleInfo(server)
  let ws = new WebSocket(server.URL)
  ws.on('open', function open() {
    ConsoleInfo(`connected <===> ${server.URL}`)
    ws.send(GenDeclare(SelfPublicKey, SelfPrivateKey, SelfURL))
    Conns[server.Address] = ws
  })

  ws.on('message', function incoming(buffer) {
    let message = buffer.toString()
    ConsoleWarn(message)
    checkMessage(ws, message)
  })

  ws.on('close', function close() {
    ConsoleWarn(`disconnected <=X=> ${server.URL}`)
  })
}

const db_regex = /^.+\.db$/
let jobServerConn = null
let Bulletins = []

function keepServerConn() {
  let notConnected = []
  Servers.forEach(server => {
    if (Conns[server.Address] == undefined) {
      notConnected.push(server)
    }
  })

  // ConsoleWarn(notConnected)

  if (notConnected.length == 0) {
    return
  }

  let random = Math.floor(Math.random() * (notConnected.length))
  let randomServer = notConnected[random]
  if (randomServer != null) {
    connect(randomServer)
  }
  ConsoleWarn(Bulletins.length)
}

function loadDB() {
  let SQL = `SELECT address, sequence, json FROM BULLETINS ORDER BY sequence ASC`
  DB.all(SQL, (err, items) => {
    if (err) {
      ConsoleError(err)
    } else {
      items.forEach(item => {
        Bulletins.push(item)
      })
    }
  })
}

function main() {
  loadDB()
  if (jobServerConn == null) {
    jobServerConn = setInterval(keepServerConn, 8000)
  }
}

main()