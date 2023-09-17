import Link from "next/link"
import Pagination from "@/components/Pagination"
import Account from "@/components/Account"
import Avatar from "@/components/Avatar"
import Timestamp from "@/components/Timestamp"

async function getData(page) {
  let url = `${process.env.BASE_URL}/api/bulletins?page=${page}`
  // console.log(`***********************************************************************************************************************************************************************************************************************************************************************************`)
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    // next: { revalidate: 30 }
    cache: 'no-store'
  })
  const json = await response.json()
  if (!json) {
    return { bulletins: [], bulletin_size: 0 }
  } else {
    return json
  }
}

async function Bulletins(props) {
  let page_cursor = 1
  if (props.searchParams.page && props.searchParams.page > 1) {
    page_cursor = props.searchParams.page
  }
  let data = await getData(page_cursor)
  let bulletins = data.bulletins
  let bulletin_size = data.bulletin_size

  return (
    <div>
      <ul>
        {bulletins.map((bulletin) => (
          <li key={bulletin.hash} className="py-1">
            <div className="flex flex-row">
              <div className="flex-none">
                <Avatar str={bulletin.address} size={50} />
              </div>
              <div className="flex flex-col">
                <div>
                  <Account address={bulletin.address} />
                  <Link href={`/bulletins/${bulletin.hash}`} className="font-bold bg-yellow-500 rounded-md px-1">#{bulletin.sequence}</Link>
                  <Timestamp timestamp={bulletin.signed_at} />
                </div>
                <div>
                  <span className="">
                    {bulletin.content.slice(0, 44).trim()}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pagination url={`/bulletins`} page_size={bulletin_size} page_cursor={page_cursor}></Pagination>
    </div >
  )
}

export default Bulletins