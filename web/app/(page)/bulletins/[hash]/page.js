// 'use client'

import Link from "next/link"
import { notFound } from 'next/navigation'
import Account from "@/components/Account"
import Avatar from "@/components/Avatar"
import Timestamp from "@/components/Timestamp"
import QRCode from "@/components/QRCode"
import Pagination from "@/components/Pagination"

async function getData(hash, page) {
  let url = `${process.env.BASE_URL}/api/bulletins/${hash}?page=${page}`
  // console.log(`***********************************************************************************************************************************************************************************************************************************************************************************`)
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 }
    // cache: 'no-store'
  })
  const json = await response.json()
  if (!json) {
    console.log(`=============================3`)
    console.log(json)
    return undefined
  } else {
    return json
  }
}

async function Bulletin(props) {
  let page_cursor = 1
  if (props.searchParams.page && props.searchParams.page > 1) {
    page_cursor = props.searchParams.page
  }
  let data = await getData(props.params.hash, page_cursor)
  let bulletin = data.bulletin
  if (!bulletin) {
    notFound()
  }
  let quotes = bulletin.quote
  quotes = JSON.parse(quotes)

  let next = data.next
  let replys = data.replys
  let reply_size = data.reply_size

  let pk = JSON.parse(bulletin.json).PublicKey
  let qr_json = {
    "Relay": process.env.BASE_URL,
    "PublicKey": pk
  }
  let qrcode = JSON.stringify(qr_json)

  return (
    <div>
      <div className="flex flex-row">
        <div className="flex-none">
          <Avatar str={bulletin.address} size={50} />
        </div>
        <div className="flex flex-col">
          <div>
            <Link href={`/bulletins/${bulletin.hash}/json`} className="inline font-bold bg-blue-500 px-2 rounded-lg">Bulletin#{bulletin.hash}</Link>
            <br />
            <Account address={bulletin.address} />
            <Link href={`/bulletins/${bulletin.hash}`} className="font-bold bg-yellow-500 rounded-md px-1">#{bulletin.sequence}</Link>
            <br />
            <Timestamp timestamp={bulletin.signed_at} />
          </div>
          <div>
            {
              bulletin.sequence != 1 ?
                <Link href={`/bulletins/${bulletin.pre_hash}`} className='inline bg-yellow-500 rounded-md px-0.5'>上一篇</Link> : <></>
            }
            {
              next ?
                <Link href={`/bulletins/${next.hash}`} className='inline bg-yellow-500 rounded-md px-0.5'>下一篇</Link> : <></>
            }
          </div>
          {
            quotes.length != 0 ?
              <div className="flex flex-wrap">
                引用：{quotes.map((quote) => (
                  <div className="inline" key={quote.Hash}>
                    <Link href={`/bulletins/${quote.Hash}`} className=' bg-yellow-500 rounded-md px-1'>{quote.Address}#{quote.Sequence}</Link>
                  </div>
                ))}
              </div> : <></>
          }
          <hr />
          <div dangerouslySetInnerHTML={{ __html: bulletin.content.replace(/\n/g, "<br>") }} className="break-all"></div>
        </div>
        <div className="flex flex-col">
          <QRCode content={qrcode} />
        </div>
      </div>
      <div>
        <ul>
          {replys.map((reply) => (
            <li key={reply.quote_hash} >
              <hr />
              <div className="flex flex-row">
                <div className="flex-none">
                  <Avatar str={reply.address} size={50} />
                </div>
                <div className="flex flex-col">
                  <div>
                    <Account address={reply.address} />
                    <Link href={`/bulletins/${reply.quote_hash}`} className="font-bold bg-yellow-500 rounded-md px-1">#{reply.sequence}</Link>
                    <Timestamp timestamp={reply.signed_at} />
                  </div>
                  <div>
                    <div dangerouslySetInnerHTML={{ __html: reply.content.replace(/\n/g, "<br>") }} className="break-all"></div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div >
      <Pagination url={`/bulletins/${bulletin.hash}`} page_size={reply_size} page_cursor={page_cursor}></Pagination>
    </div>
  )
}

export default Bulletin