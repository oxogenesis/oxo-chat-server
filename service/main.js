const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const oxoKeyPairs = require("oxo-keypairs")

//config
const SelfURL = "ws://127.0.0.1:8000"
//standalone server
// const Seed = oxoKeyPairs.generateSeed("obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf", 'secp256k1')
// const SelfURL = "wss://ru.oxo-chat-server.com"
const Seed = "xxJTfMGZPavnqHhcEcHw5ToPCHftw"
const OtherServer = []

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

function strServerMessage(msgCode) {
  msgJson = { "Action": ActionCode["ServerMessage"], "Code": msgCode }
  return JSON.stringify(msgJson)
}

function sendServerMessage(ws, msgCode) {
  ws.send(strServerMessage(msgCode))
}

//client connection
let ClientConns = {}

function fetchClientConnAddress(ws) {
  for (let address in ClientConns) {
    if (ClientConns[address] == ws) {
      return address
    }
  }
  return null
}

let ClientServer = null

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//client listener
function teminateClientConn(ws) {
  ws.close()
  let connAddress = fetchClientConnAddress(ws)
  if (connAddress != null) {
    console.log(`###################LOG################### client disconnect... <${connAddress}>`)
    delete ClientConns[connAddress]
  }
}

////////hard copy from client<<<<<<<<
let BulletinCount = 0
let PageSize = 10
let PageCount = BulletinCount / PageSize
let PageLinks = ''
let BulletinAccounts = []

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
const PublicKey = keypair.publicKey
const PrivateKey = keypair.privateKey

function sign(msg, sk) {
  let msgHexStr = strToHex(msg);
  let sig = oxoKeyPairs.sign(msgHexStr, sk);
  return sig;
}

function GenBulletinRequest(address, sequence, to) {
  let json = {
    "Action": ActionCode["BulletinRequest"],
    "Address": address,
    "Sequence": sequence,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenObjectResponse(object, to) {
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

function GenDeclare() {
  //send declare to server
  let json = {
    "Action": ActionCode["Declare"],
    "Timestamp": new Date().getTime(),
    "PublicKey": PublicKey
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

////////hard copy from client>>>>>>>>

async function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = quarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)

  let result = await prisma.BULLETINS.create({
    data: {
      hash: hash,
      pre_hash: bulletin.PreHash,
      address: address,
      sequence: bulletin.Sequence,
      content: bulletin.Content,
      quote: JSON.stringify(bulletin.Quote),
      json: JSON.stringify(bulletin),
      signed_at: bulletin.Timestamp,
      created_at: timestamp
    }
  })

  if (result) {
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

    //update pre_bulletin's next_hash
    result = await prisma.BULLETINS.update({
      where: {
        hash: bulletin.PreHash,
      },
      data: {
        next_hash: hash,
      },
    })

    //update quote
    bulletin.Quote.forEach(async quote => {
      result = await prisma.QUOTES.create({
        data: {
          main_hash: quote.Hash,
          quote_hash: hash,
          address: address,
          sequence: bulletin.Sequence,
          content: bulletin.Content,
          signed_at: bulletin.Timestamp
        }
      })
    });

    //Brocdcast to OtherServer
    for (let i in OtherServer) {
      let ws = ClientConns[OtherServer[i]["Address"]]
      if (ws != undefined && ws.readyState == WebSocket.OPEN) {
        ws.send(GenObjectResponse(bulletin, OtherServer[i]["Address"]))
      }
    }
  }
}

async function handleClientMessage(message, json) {
  if (json["To"] != null && ClientConns[json["To"]] != null && ClientConns[json["To"]].readyState == WebSocket.OPEN) {
    //forward message
    ClientConns[json["To"]].send(message)

    //cache bulletin
    if (json["Action"] == ActionCode["ObjectResponse"] && json["Object"]["ObjectType"] == ObjectType["Bulletin"]) {
      //console.log(`###################LOG################### Client Message:`)
      //console.log(message)
      CacheBulletin(json["Object"])
    }
  }

  if (json["Action"] == ActionCode["BulletinRequest"]) {
    //send cache bulletin
    let bulletin = await prisma.BULLETINS.findFirst({
      where: {
        address: json["Address"],
        sequence: json["Sequence"]
      },
      select: {
        json: true
      }
    })
    if (bulletin != null) {
      let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
      ClientConns[address].send(bulletin.json)
    }
  } else if (json["Action"] == ActionCode["BulletinRandom"]) {
    console.log("=====================random")
    //send random bulletin
    let bulletin = await prisma.$queryRaw`SELECT * FROM "public"."BULLETINS" ORDER BY RANDOM() LIMIT 1`
    if (bulletin != null && bulletin.length > 0) {
      let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
      ClientConns[address].send(bulletin[0].json)
    }
  } else if (json["To"] == Address && json["Action"] == ActionCode["ObjectResponse"] && json["Object"]["ObjectType"] == ObjectType["Bulletin"]) {
    CacheBulletin(json["Object"])
    //fetch more bulletin
    let address = oxoKeyPairs.deriveAddress(json["Object"].PublicKey)
    if (ClientConns[address] != null && ClientConns[address].readyState == WebSocket.OPEN) {
      let msg = GenBulletinRequest(address, json["Object"].Sequence + 1, address)
      ClientConns[address].send(msg)
    }
  }
}

async function checkClientMessage(ws, message) {
  // console.log(`###################LOG################### Client Message:`)
  // console.log(`${message}`)
  let json = Schema.checkClientSchema(message)
  if (json == false) {
    //json格式不合法
    sendServerMessage(ws, MessageCode["JsonSchemaInvalid"])
    // console.log(`json格式不合法`)
    teminateClientConn(ws)
  } else {
    let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
    if (ClientConns[address] == ws) {
      //连接已经通过"声明消息"校验过签名
      handleClientMessage(message, json)
    } else {
      let connAddress = fetchClientConnAddress(ws)
      if (connAddress != null && connAddress != address) {
        //using different address in same connection
        sendServerMessage(ws, MessageCode["AddressChanged"])
        teminateClientConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          //"声明消息"签名不合法
          sendServerMessage(ws, MessageCode["SignatureInvalid"])
          teminateClientConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          //"声明消息"生成时间过早
          sendServerMessage(ws, MessageCode["TimestampInvalid"])
          teminateClientConn(ws)
          return
        }

        if (connAddress == null && ClientConns[address] == null) {
          //new connection and new address
          //当前连接无对应地址，当前地址无对应连接，全新连接
          console.log(`connection established from client <${address}>`)
          ClientConns[address] = ws
          //handleClientMessage(message, json)
          let bulletin = await prisma.BULLETINS.findFirst({
            where: {
              address: address
            },
            orderBy: {
              sequence: "desc"
            },
            select: {
              sequence: true
            }
          })
          let sequence = 1
          if (bulletin != null) {
            sequence = bulletin.sequence + 1
          }
          let msg = GenBulletinRequest(address, sequence, address)
          ClientConns[address].send(msg)
        } else if (ClientConns[address] != ws && ClientConns[address].readyState == WebSocket.OPEN) {
          //new connection kick old conection with same address
          //当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          sendServerMessage(ClientConns[address], MessageCode["NewConnectionOpening"])
          ClientConns[address].close()
          ClientConns[address] = ws
          //handleClientMessage(message, json)
        } else {
          ws.send("WTF...")
          teminateClientConn(ws)
        }
      }
    }
  }
}

function startClientServer() {
  if (ClientServer == null) {
    ClientServer = new WebSocket.Server({
      port: 8000, //to bind on 80, must use 'sudo node main.js'
      clientTracking: true,
      maxPayload: 512 * 1024
    })

    ClientServer.on('connection', function connection(ws) {
      ws.on('message', function incoming(message) {
        checkClientMessage(ws, message)
      })

      ws.on('close', function close() {
        let connAddress = fetchClientConnAddress(ws)
        if (connAddress != null) {
          console.log(`client <${connAddress}> disconnect...`)
          delete ClientConns[connAddress]
        }
      })
    })
  }
}

startClientServer()

function keepOtherServerConn() {
  let notConnected = []
  for (let i in OtherServer) {
    if (ClientConns[OtherServer[i]["Address"]] == undefined) {
      notConnected.push(OtherServer[i])
    }
  }

  if (notConnected.length == 0) {
    return
  }

  let random = Math.floor(Math.random() * (notConnected.length))
  let randomServerUrl = notConnected[random]["URL"]
  if (randomServerUrl != null) {
    console.log(`keepOtherServerConn connecting to StaticCounter ${randomServerUrl}`)
    try {
      var ws = new WebSocket(randomServerUrl)

      ws.on('open', function open() {
        ws.send(GenDeclare())
        ClientConns[notConnected[random]["Address"]] = ws
      })

      ws.on('message', function incoming(message) {
        checkClientMessage(ws, message)
      })

      ws.on('close', function close() {
        let connAddress = fetchClientConnAddress(ws)
        if (connAddress != null) {
          console.log(`client <${connAddress}> disconnect...`)
          delete ClientConns[connAddress]
        }
      })
    } catch (e) {
      console.log('keepOtherServerConn error...')
    }
  }
}

let OtherServerConnJob = null
if (OtherServerConnJob == null) {
  OtherServerConnJob = setInterval(keepOtherServerConn, 5000);
}
