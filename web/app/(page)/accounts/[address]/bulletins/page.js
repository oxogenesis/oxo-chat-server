
import Link from "next/link"
import Pagination from "@/components/Pagination"
import Timestamp from "@/components/Timestamp"
import Account from "@/components/Account"
import Avatar from "@/components/Avatar"

async function getData(page, address) {
  let url = `${process.env.BASE_URL}/api/accounts/${address}/bulletins?page=${page}`
  // console.log(`***********************************************************************************************************************************************************************************************************************************************************************************`)
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 30 }
    // cache: 'no-store'
  })
  const json = await response.json()
  if (!json) {
    console.log(`=============================3`)
    console.log(json)
  } else {
    return json
  }
}

async function Bulletins(props) {
  let page_cursor = 1
  if (props.searchParams.page && props.searchParams.page > 1) {
    page_cursor = props.searchParams.page
  }
  let data = await getData(page_cursor, props.params.address)
  let bulletins = data.bulletins
  let bulletin_size = data.bulletin_size

  return (
    <div>
      <div className="flex flex-row">
        <div className="flex-none">
          <Avatar str={props.params.address} size={50} />
        </div>
        <div className="flex flex-col">
          Bulletins#<Account address={props.params.address} />
        </div>
      </div>
      <ul>
        {bulletins.map((bulletin) => (
          <li key={bulletin.hash} className="py-1">
            <div className="flex flex-col">
              <div>
                <Link href={`/bulletins/${bulletin.hash}`} className="font-bold bg-yellow-500 rounded-md px-1">#{bulletin.sequence}</Link>
                <Timestamp timestamp={bulletin.signed_at} />
              </div>
              <div>
                <span>
                  {bulletin.content}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pagination url={`/accounts/${props.params.address}/bulletins`} page_size={bulletin_size} page_cursor={page_cursor}></Pagination>
    </div>
  )
}

export default Bulletins