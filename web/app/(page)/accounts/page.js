import Avatar from "@/components/Avatar"
import Account from "@/components/Account"
import Pagination from "@/components/Pagination"
import { PageSize } from "@/lib/Util"

async function getData() {
  let url = `${process.env.BASE_URL}/api/accounts`
  // console.log(`***********************************************************************************************************************************************************************************************************************************************************************************`)
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 }
    // cache: 'no-store'
  })
  const json = await response.json()
  if (!json) {
    return { accounts: [] }
  } else {
    return json
  }
}

async function Accounts(props) {
  let page_cursor = 1
  if (props.searchParams.page && props.searchParams.page > 1) {
    page_cursor = props.searchParams.page
  }
  let data = await getData(page_cursor)
  let accounts = data.accounts
  let account_size = accounts.length
  let begin_cursor = (page_cursor - 1) * PageSize
  accounts = accounts.slice(begin_cursor, begin_cursor + PageSize)

  return (
    <div>
      <ul>
        {accounts.map((account) => (
          <li key={account.address} className="py-1">
            <div className="flex flex-row">
              <div className="flex-none">
                <Avatar str={account.address} size={50} />
              </div>
              <div className="flex flex-col">
                <div>
                  <Account address={account.address} />
                </div>
                <div>
                  <span>#{account._count.hash}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pagination url={`/accounts`} page_size={account_size} page_cursor={page_cursor}></Pagination>
    </div>
  )
}

export default Accounts