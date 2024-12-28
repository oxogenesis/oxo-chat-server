const GenesisAddress = 'obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf'
// const GenesisHash = QuarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

const PageSize = 20

const ActionCode = {
  Declare: 100,
  ObjectResponse: 101,

  BulletinRequest: 200,
  BulletinRandomRequest: 201,
  BulletinFileChunkRequest: 202,
  BulletinAddressListRequest: 203,
  BulletinAddressListResponse: 204,
  BulletinReplyListRequest: 205,
  BulletinReplyListResponse: 206,

  ChatMessageSync: 301,
  ChatMessageSyncFromServer: 302,
  ChatFileRequest: 303,

  // GroupRequest: 401,
  // GroupManageSync: 402,
  // GroupDH: 403,
  // GroupMessageSync: 404,
  // GroupFileRequest: 405
}

const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  ChatDH: 201,
  ChatMessage: 202,
  ChatFileChunk: 203,

  // GroupManage: 301,
  // GroupMessage: 302,
  // GroupFileChunk: 303
}

const MessageCode = {
  JsonSchemaInvalid: 0, //json schema invalid...
  SignatureInvalid: 1, //signature invalid...
  TimestampInvalid: 2, //timestamp invalid...
  BalanceInsufficient: 3, //balance insufficient...
  NewConnectionOpening: 4, //address changed...
  AddressChanged: 5, //new connection with same address is opening...
  ToSelfIsForbidden: 6, //To self is forbidden...
  ToNotExist: 7, //To not exist...

  GatewayDeclareSuccess: 1000 //gateway declare success...
}

module.exports = {
  GenesisAddress,
  GenesisHash,

  FileMaxSize,
  FileChunkSize,
  BulletinFileExtRegex,

  PageSize,

  FileMaxSize,
  FileChunkSize,
  BulletinFileExtRegex,

  PageSize,

  ActionCode,
  ObjectType,
  MessageCode,
}