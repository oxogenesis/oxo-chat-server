
import Account from "@/components/Account"
import Avatar from "@/components/Avatar"
import Timestamp from "@/components/Timestamp"
import LinkBulletin from "@/components/LinkBulletin"

async function Page(props) {
  const data = await getData()
  const bulletins = data.bulletins
  const bulletin_size = data.bulletin_size
  const account_size = data.account_size

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
                  <LinkBulletin hash={bulletin.hash} str={`#${bulletin.sequence}`} />
                  <Timestamp timestamp={bulletin.signed_at} />
                </div>
                <div>
                  <span className="">
                    {bulletin.content}
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

export async function getData() {
  const res = await fetch(`${process.env.BASE_URL}/api/home`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 }
    // cache: 'no-store'
  })
  const data = await res.json()
  if (!data) {
    const bulletins = []
    const a = 0
    return { props: { bulletins, a, a } }
  } else {
    return data
    // return { props: { bulletins, bulletin_size, account_size } }
  }
}

export default Page