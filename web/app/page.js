import Link from "next/link"
import Account from "@/components/Account"
import Avatar from "@/components/Avatar"
import Timestamp from "@/components/Timestamp"

async function getData() {
  let url = `${process.env.BASE_URL}/api/home`
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    // next: { revalidate: 60 }
    cache: 'no-store'
  })
  const json = await response.json()
  if (!json) {
    return { bulletins: [], bulletin_size: 0, account_size: 0 }
  } else {
    return json
  }
}

async function Home() {
  let data = await getData()
  let bulletins = data.bulletins
  let bulletin_size = data.bulletin_size
  let account_size = data.account_size

  return (
    <div>
      <div>帖子总数：{bulletin_size}</div>
      <div>账户总数：{account_size}</div>
      <div>十大热门帖子：</div>
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
    </div >
  )
}

export default Home