const Ajv = require('ajv')
const { ActionCode, ObjectType } = require('./OXO')
const ajv = new Ajv({ allErrors: true })

// client schema
// >>>declare<<<
const DeclareSchema = {
  "type": "object",
  "required": ["Action", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 5,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.Declare
    },
    "URL": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const ObjectResponseSchema = {
  "type": "object",
  "required": ["Action", "Object", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 6,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.ObjectResponse
    },
    "Object": {
      "type": "object"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

// >>>bulletin<<<
let BulletinSchema = {
  "type": "object",
  "required": ["ObjectType", "Sequence", "PreHash", "Content", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 9,
  "properties": {
    "ObjectType": {
      "type": "number",
      "const": ObjectType.Bulletin
    },
    "Sequence": {
      "type": "number"
    },
    "PreHash": {
      "type": "string"
    },
    "Content": {
      "type": "string"
    },
    "Quote": {
      "type": "array",
      "minItems": 1,
      // "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["Address", "Sequence", "Hash"],
        "properties": {
          "Address": { "type": "string" },
          "Sequence": { "type": "number" },
          "Hash": { "type": "string" }
        }
      }
    },
    "File": {
      "type": "array",
      "minItems": 1,
      // "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["Name", "Ext", "Size", "Hash"],
        "properties": {
          "Name": { "type": "string" },
          "Ext": { "type": "string" },
          "Size": { "type": "number" },
          "Hash": { "type": "string" }
        }
      }
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const BulletinRandomRequestSchema = {
  "type": "object",
  "required": ["Action", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 4,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinRandomRequest
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const BulletinRequestSchema = {
  "type": "object",
  "required": ["Action", "Address", "Sequence", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 7,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinRequest
    },
    "Address": {
      "type": "string"
    },
    "Sequence": {
      "type": "number"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const BulletinFileChunkRequestSchema = {
  "type": "object",
  "required": ["Action", "Hash", "Cursor", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 7,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinFileChunkRequest
    },
    "Hash": {
      "type": "string"
    },
    "Cursor": {
      "type": "number"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

// BulletinCount DESC
const BulletinAddressListRequestSchema = {
  "type": "object",
  "required": ["Action", "Page", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 5,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinAddressListRequest
    },
    "Page": {
      "type": "number"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const BulletinAddressListResponseSchema = {
  "type": "object",
  "required": ["Action", "Page", "List", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 6,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinAddressListResponse
    },
    "Page": {
      "type": "number"
    },
    "List": {
      "type": "array",
      "minItems": 1,
      // "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["Address", "Count"],
        "maxProperties": 2,
        "properties": {
          "Address": { "type": "string" },
          "Count": { "type": "number" }
        }
      }
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

// Timestamp DESC
const BulletinReplyListRequestSchema = {
  "type": "object",
  "required": ["Action", "Hash", "Page", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 6,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinReplyListRequest
    },
    "Hash": {
      "type": "string"
    },
    "Page": {
      "type": "number"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

let BulletinReplyListResponseSchema = {
  "type": "object",
  "required": ["Action", "Hash", "Page", "List"],
  "maxProperties": 4,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.BulletinReplyListResponse
    },
    "Hash": {
      "type": "string"
    },
    "Page": {
      "type": "number"
    },
    "List": {
      "type": "array",
      "minItems": 1,
      // "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["Address", "Sequence", "Hash", "Content", "Timestamp"],
        "maxProperties": 5,
        "properties": {
          "Address": { "type": "string" },
          "Sequence": { "type": "number" },
          "Hash": { "type": "string" },
          "Content": { "type": "string" },
          "Timestamp": { "type": "number" }
        }
      }
    }
  }
}

// >>>chat<<<
// ChatDH
const ChatDHSchema = {
  "type": "object",
  "required": ["ObjectType", "Partition", "Sequence", "DHPublicKey", "Pair", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 9,
  "properties": {
    "ObjectType": {
      "type": "number",
      "const": ObjectType.ChatDH
    },
    "Partition": {
      "type": "number"
    },
    "Sequence": {
      "type": "number"
    },
    "DHPublicKey": {
      "type": "string"
    },
    "Pair": {
      "type": "string"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const ChatMessageSchema = {
  "type": "object",
  "required": ["ObjectType", "Sequence", "PreHash", "Content", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 9,
  "properties": {
    "ObjectType": {
      "type": "number",
      "const": ObjectType.ChatMessage
    },
    "Sequence": {
      "type": "number"
    },
    "PreHash": {
      "type": "string"
    },
    "ACK": {
      "type": "array",
      "minItems": 1,
      // "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["Sequence", "Hash"],
        "maxProperties": 5,
        "properties": {
          "Sequence": { "type": "number" },
          "Hash": { "type": "string" }
        }
      }
    },
    "Content": {
      "type": "string"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const ChatMessageSyncSchema = {
  "type": "object",
  "required": ["Action", "CurrentSequence", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 6,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.ChatMessageSync
    },
    "CurrentSequence": {
      "type": "number"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

// >>>group<<<
// group request
const GroupRequestSchema = {
  "type": "object",
  "required": ["Action", "GroupHash", "GroupManageAction", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 7,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.GroupRequest
    },
    "GroupHash": {
      "type": "string"
    },
    //leave:0
    //join:1
    "GroupManageAction": {
      "type": "number"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const GroupManageSyncSchema = {
  "type": "object",
  "required": ["Action", "GroupHash", "CurrentSequence", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 7,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.GroupManageSync
    },
    "GroupHash": {
      "type": "string"
    },
    "CurrentSequence": {
      "type": "number"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const GroupDHSchema = {
  "type": "object",
  "required": ["Action", "GroupHash", "DHPublicKey", "Pair", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 8,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.GroupDH
    },
    "GroupHash": {
      "type": "string"
    },
    "DHPublicKey": {
      "type": "string"
    },
    "Pair": {
      "type": "string"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

const GroupMessageSyncSchema = {
  "type": "object",
  "required": ["Action", "GroupHash", "Address", "CurrentSequence", "To", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 8,
  "properties": {
    "Action": {
      "type": "number",
      "const": ActionCode.GroupMessageSync
    },
    "GroupHash": {
      "type": "string"
    },
    "Address": {
      "type": "string"
    },
    "CurrentSequence": {
      "type": "number"
    },
    "To": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}

let GroupMessageSchema = {
  "type": "object",
  "required": ["GroupHash", "Sequence", "PreHash", "Content", "Timestamp", "PublicKey", "Signature"],
  "maxProperties": 8,
  "properties": {
    "GroupHash": {
      "type": "string"
    },
    "Sequence": {
      "type": "number"
    },
    "PreHash": {
      "type": "string"
    },
    "Confirm": {
      "type": "object",
      "required": ["Address", "Sequence", "Hash"],
      "properties": {
        "Address": { "type": "string" },
        "Sequence": { "type": "number" },
        "Hash": { "type": "string" }
      }
    },
    "Content": {
      "type": "string"
    },
    "Timestamp": {
      "type": "number"
    },
    "PublicKey": {
      "type": "string"
    },
    "Signature": {
      "type": "string"
    }
  }
}
//end client schema



//client
const vDeclare = ajv.compile(DeclareSchema)
const vObjectResponseSchema = ajv.compile(ObjectResponseSchema)

const vBulletinSchema = ajv.compile(BulletinSchema)
const vBulletinRandomRequestSchema = ajv.compile(BulletinRandomRequestSchema)
const vBulletinRequestSchema = ajv.compile(BulletinRequestSchema)
const vBulletinFileChunkRequestSchema = ajv.compile(BulletinFileChunkRequestSchema)
const vBulletinAddressListRequestSchema = ajv.compile(BulletinAddressListRequestSchema)
const vBulletinAddressListResponseSchema = ajv.compile(BulletinAddressListResponseSchema)
const vBulletinReplyListRequestSchema = ajv.compile(BulletinReplyListRequestSchema)

const vChatMessageSchema = ajv.compile(ChatMessageSchema)
const vChatMessageSyncSchema = ajv.compile(ChatMessageSyncSchema)
const vChatDHSchema = ajv.compile(ChatDHSchema)

const vGroupManageSyncSchema = ajv.compile(GroupManageSyncSchema)
const vGroupDHSchema = ajv.compile(GroupDHSchema)
const vGroupMessageSyncSchema = ajv.compile(GroupMessageSyncSchema)
const vGroupRequestSchema = ajv.compile(GroupRequestSchema)

function CheckMessageSchema(strJson) {
  if (typeof strJson == "string") {
    try {
      const json = JSON.parse(strJson)
      if (vObjectResponseSchema(json) || vBulletinSchema(json) || vBulletinRandomRequestSchema(json) || vBulletinRequestSchema(json) || vBulletinFileChunkRequestSchema(json) || vBulletinAddressListRequestSchema(json) || vBulletinAddressListResponseSchema(json) || vBulletinReplyListRequestSchema(json) || vChatMessageSchema(json) || vChatMessageSyncSchema(json) || vChatDHSchema(json) || vDeclare(json) || vGroupRequestSchema(json) || vGroupManageSyncSchema(json) || vGroupDHSchema(json) || vGroupMessageSyncSchema(json)) {
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
  CheckMessageSchema
}