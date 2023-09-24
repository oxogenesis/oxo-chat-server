import Link from 'next/link'

export default function NotFound(props) {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find bulletin with the given hash</p>
      <Link href="/">Return Home</Link>
    </div>
  )
}