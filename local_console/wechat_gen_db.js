const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3')
const oxoKeyPairs = require("oxo-keypairs")

const { GenesisHash } = require('./oxo_const.js')
const { GenBulletinJson } = require('./msg_generator.js')
const { QuarterSHA512 } = require('./util.js')

// config
const ConfigPath = './wechat_config.json'

let Address
let PublicKey
let PrivateKey
let PostPath
let BulletinDB

let CurrentSequence = 0
let CurrentPreHash = GenesisHash

// keep alive
process.on('uncaughtException', function (err) {
  // 打印出错误
  console.log(err)
  // 打印出错误的调用栈方便调试
  console.log(err.stack)
})

function initBulletinDB(db) {
  // 建表
  db.serialize(() => {
    // 为账号地址起名
    db.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
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

async function queryAll(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, items) => {
      if (err) {
        reject(err)
      } else {
        resolve(items)
      }
    })
  })
}

async function runSql(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, err => {
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
  let bulletin = GenBulletinJson(CurrentSequence + 1, CurrentPreHash, null, null, content, timestamp, PublicKey, PrivateKey)
  let bulletin_str = JSON.stringify(bulletin)
  let hash = QuarterSHA512(bulletin_str)
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
  let files = fs.readdirSync(PostPath)
  let bulletin_list = []
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i]
    let filePath = path.join(PostPath, fileName)
    let fileStat = fs.statSync(filePath)

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
        let content = fs.readFileSync(filePath, 'utf8')
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
      for (const [hash, pre_hash, Address, sequence, content, json, signed_at] of bulletin_list) {
        insertStatement.run(hash, pre_hash, Address, sequence, content, json, signed_at)
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

function main() {
  let begin_at = Date.now()

  // config
  let config = fs.readFileSync(ConfigPath, 'utf8')
  config = JSON.parse(config)
  PostPath = config.PostPath
  let seed = config.Seed

  // seed
  if (seed == '') {
    seed = oxoKeyPairs.generateSeed("RandomSeed", 'secp256k1')
  }
  const keypair = oxoKeyPairs.deriveKeypair(seed)
  Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
  PublicKey = keypair.publicKey
  PrivateKey = keypair.privateKey

  // db
  let db_path = `./${Address}.db`
  if (fs.existsSync(db_path)) {
    fs.rmSync(db_path)
  }
  BulletinDB = new sqlite3.Database(db_path)
  initBulletinDB(BulletinDB)

  // run
  loadWechat()

  let end_at = Date.now()
  console.log(`cost   time:`, end_at - begin_at)

  console.log(`use account:`, Address)
  console.log(`use    seed:`, seed)
}

main()