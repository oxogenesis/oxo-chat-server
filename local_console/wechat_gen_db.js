const Fs = require('fs')
const Crypto = require('crypto')
const Path = require('path')
const Sqlite3 = require('sqlite3')
const oxoKeyPairs = require("oxo-keypairs")

// const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

// config
const PostPath = `./`
const Seed = ""
// const Seed = oxoKeyPairs.generateSeed("RandomSeed", 'secp256k1')

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
const PublicKey = keypair.publicKey
const PrivateKey = keypair.privateKey

const DBPath = `./${Address}.db`
let CurrentSequence = 0
let CurrentPreHash = GenesisHash

// keep alive
process.on('uncaughtException', function (err) {
  // 打印出错误
  console.log(err)
  // 打印出错误的调用栈方便调试
  console.log(err.stack)
})

// crypto
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

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

// oxo
function sign(msg, sk) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

// message generator
const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  PrivateFile: 201,

  GroupManage: 301,
  GroupMessage: 302,
  GroupFile: 303
}

function genBulletinJson(sequence, pre_hash, content, timestamp) {
  let content_hash = quarterSHA512(content)
  let tmp_json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: sequence,
    PreHash: pre_hash,
    ContentHash: content_hash,
    Timestamp: timestamp,
    PublicKey: PublicKey
  }
  let sig = sign(JSON.stringify(tmp_json), PrivateKey)

  let json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: sequence,
    PreHash: pre_hash,
    Content: content,
    Timestamp: timestamp,
    PublicKey: PublicKey,
    Signature: sig
  }
  return json
}

// db
if (Fs.existsSync(DBPath)) {
  Fs.rmSync(DBPath)
}

let BulletinDB = new Sqlite3.Database(DBPath)

function initBulletinDB() {
  // 建表
  BulletinDB.serialize(() => {
    // 为账号地址起名
    BulletinDB.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
      hash VARCHAR(32) PRIMARY KEY,
      pre_hash VARCHAR(32),
      address VARCHAR(35) NOT NULL,
      sequence INTEGER NOT NULL,
      quote TEXT,
      file TEXT,
      content TEXT NOT NULL,
      json TEXT NOT NULL,
      signed_at INTEGER NOT NULL)`, err => {
      if (err) {
        console.log(err)
      }
    })
  })
}

async function queryAll(sql) {
  return new Promise((resolve, reject) => {
    BulletinDB.all(sql, [], (err, items) => {
      if (err) {
        reject(err)
      } else {
        resolve(items)
      }
    })
  })
}

async function runSql(sql) {
  return new Promise((resolve, reject) => {
    BulletinDB.run(sql, err => {
      if (err) {
        console.log(err)
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

function gen_bulletin(content, timestamp) {
  let bulletin = genBulletinJson(CurrentSequence + 1, CurrentPreHash, content, timestamp)
  let bulletin_str = JSON.stringify(bulletin)
  let hash = quarterSHA512(bulletin_str)
  CurrentSequence = CurrentSequence + 1
  CurrentPreHash = hash
  let value = [hash, bulletin.PreHash, Address, bulletin.Sequence, bulletin.Content, bulletin_str, bulletin.Timestamp]
  console.log(`CacheBulletin#${bulletin.Sequence} : ${hash}`)
  return value
}

const bulletinFileReg = /^(\d{8})(.+)\.md$/
const dateReg = /^(\d{4})(\d{2})(\d{2})$/

function prepareBulletins() {
  let lastDate = '20001111'
  let minCount = 0
  let files = Fs.readdirSync(PostPath)
  let bulletin_list = []
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i]
    let filePath = Path.join(PostPath, fileName)
    let fileStat = Fs.statSync(filePath)

    let isFile = fileStat.isFile()
    let isDir = fileStat.isDirectory()
    if (isFile) {
      let matches = fileName.toString().match(bulletinFileReg)
      if (matches) {
        let date = matches[1]
        matches = date.match(dateReg)
        let [, year, month, day] = matches
        let min = 0
        if (lastDate == date) {
          minCount = minCount + 1
          min = minCount
        } else {
          minCount = 0
        }
        let timestamp = new Date(year, month - 1, day, 0, min)
        timestamp = timestamp.getTime()
        let content = Fs.readFileSync(filePath, 'utf8')
        let bulletin = gen_bulletin(content, timestamp)
        bulletin_list.push(bulletin)
      }
    }
    if (isDir) {
      prepareBulletins(filePath)
    }
  }
  return bulletin_list
}

function loadWechat() {
  let bulletin_list = prepareBulletins()
  try {
    BulletinDB.serialize(() => {
      // 开始事务
      BulletinDB.run("BEGIN")
      const insertStatement = BulletinDB.prepare(`INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, json, signed_at) VALUES (?,?,?,?,?,?,?)`)
      // 遍历数组并插入数据
      for (const [hash, pre_hash, address, sequence, content, json, signed_at] of bulletin_list) {
        insertStatement.run(hash, pre_hash, address, sequence, content, json, signed_at)
      }
      insertStatement.finalize()
      // 提交事务
      BulletinDB.run("COMMIT")
    })
    console.log("数据插入成功")
  } catch (err) {
    console.error("插入数据时出错:", err)
    // 回滚事务，防止部分数据插入
    BulletinDB.run("ROLLBACK")
  } finally {
    BulletinDB.close((err) => {
      if (err) {
        console.error("关闭数据库时出错:", err)
      } else {
        console.log("数据库已关闭")
      }
    })
  }
}

function go() {
  let begin_at = Date.now()
  initBulletinDB()
  // gen_bulletin()
  loadWechat()
  let end_at = Date.now()
  console.log(`cost   time:`, end_at - begin_at)
  console.log(`use account:`, Address)
  console.log(`use    seed:`, Seed)
}

go()