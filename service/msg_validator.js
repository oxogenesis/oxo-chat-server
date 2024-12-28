const Ajv = require('ajv')
const ajv = new Ajv({ allErrors: true })
const { DeclareSchema, ObjectResponseSchema, BulletinSchema, BulletinRandomRequestSchema, BulletinRequestSchema, BulletinFileChunkRequestSchema, BulletinFileChunkSchema, BulletinAddressListRequestSchema, BulletinAddressListResponseSchema, BulletinReplyListRequestSchema, ChatDHSchema, ChatMessageSchema, ChatMessageSyncSchema, ChatFileChunkSchema
  // , GroupRequestSchema, GroupManageSyncSchema, GroupDHSchema, GroupMessageSyncSchema, GroupMessageSchema 
} = require('./oxo_schema')

const vDeclare = ajv.compile(DeclareSchema)
const vObjectResponseSchema = ajv.compile(ObjectResponseSchema)

const vBulletinSchema = ajv.compile(BulletinSchema)
const vBulletinRandomRequestSchema = ajv.compile(BulletinRandomRequestSchema)
const vBulletinRequestSchema = ajv.compile(BulletinRequestSchema)
const vBulletinFileChunkRequestSchema = ajv.compile(BulletinFileChunkRequestSchema)
const vBulletinFileChunkSchema = ajv.compile(BulletinFileChunkSchema)
const vBulletinAddressListRequestSchema = ajv.compile(BulletinAddressListRequestSchema)
const vBulletinAddressListResponseSchema = ajv.compile(BulletinAddressListResponseSchema)
const vBulletinReplyListRequestSchema = ajv.compile(BulletinReplyListRequestSchema)

const vChatMessageSchema = ajv.compile(ChatMessageSchema)
const vChatMessageSyncSchema = ajv.compile(ChatMessageSyncSchema)
const vChatDHSchema = ajv.compile(ChatDHSchema)
const vChatFileChunkSchema = ajv.compile(ChatFileChunkSchema)

// const vGroupManageSyncSchema = ajv.compile(GroupManageSyncSchema)
// const vGroupDHSchema = ajv.compile(GroupDHSchema)
// const vGroupMessageSyncSchema = ajv.compile(GroupMessageSyncSchema)
// const vGroupRequestSchema = ajv.compile(GroupRequestSchema)

function MsgValidate(strJson) {
  if (typeof strJson == "string") {
    try {
      const json = JSON.parse(strJson)
      if (vObjectResponseSchema(json) || vBulletinSchema(json) || vBulletinRandomRequestSchema(json) || vBulletinRequestSchema(json) || vBulletinFileChunkRequestSchema(json) || vBulletinFileChunkSchema(json) || vBulletinAddressListRequestSchema(json) || vBulletinAddressListResponseSchema(json) || vBulletinReplyListRequestSchema(json) || vChatMessageSchema(json) || vChatMessageSyncSchema(json) || vChatDHSchema(json) || vChatFileChunkSchema(json) || vDeclare(json)
        // || vGroupRequestSchema(json) || vGroupManageSyncSchema(json) || vGroupDHSchema(json) || vGroupMessageSyncSchema(json)
      ) {
        return json
      } else {
        return false
      }
    } catch (e) {
      return false
    }
  } else {
    return false
  }
}

module.exports = {
  MsgValidate
}