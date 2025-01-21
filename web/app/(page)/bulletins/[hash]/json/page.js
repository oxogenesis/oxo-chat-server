import { notFound } from 'next/navigation'

async function getData(hash) {
  let url = `${process.env.BASE_URL}/api/bulletins/${hash}/json`
  // console.log(`***********************************************************************************************************************************************************************************************************************************************************************************`)
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 600 }
    // cache: 'no-store'
  })
  const json = await response.json()
  if (!json) {
    // console.log(`=============================3`)
    // console.log(json)
    return undefined
  } else {
    return json
  }
}

async function Bulletin(props) {
  let data = await getData((await props.params).hash)
  let bulletin = data.bulletin
  if (!bulletin) {
    notFound()
  }

  return (
    <div className='break-all'>
      {bulletin.json}
    </div>
  )
}

export default Bulletin