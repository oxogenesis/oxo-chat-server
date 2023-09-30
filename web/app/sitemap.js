import { Json2Str } from '@/lib/Util'

import prisma from '@/lib/prisma'

export default async function sitemap() {
  let bulletins_url = `${process.env.BASE_URL}/bulletins`
  let bulletins = await prisma.BULLETINS.findMany({
    select: {
      hash: true,
      signed_at: true
    }
  })
  bulletins = Json2Str(bulletins)
  bulletins = JSON.parse(bulletins)
  let bulletin_urls = bulletins.map((bulletin) => (
    {
      url: `${bulletins_url}/${bulletin.hash}`,
      lastModified: new Date(parseInt(bulletin.signed_at)),
      changeFrequency: 'weekly',
      priority: 0.5
    }
  ))
  let bulletin_json_urls = bulletins.map((bulletin) => (
    {
      url: `${bulletins_url}/${bulletin.hash}/json`,
      lastModified: new Date(parseInt(bulletin.signed_at)),
      changeFrequency: 'never',
      priority: 0.1
    }
  ))

  let accounts_url = `${process.env.BASE_URL}/accounts`
  let accounts = await prisma.BULLETINS.groupBy({
    by: ['address'],
    _count: {
      hash: true,
    },
    orderBy: {
      address: 'desc',
    }
  })
  accounts = Json2Str(accounts)
  accounts = JSON.parse(accounts)
  let account_urls = accounts.map((account) => (
    {
      url: `${accounts_url}/${account.address}/bulletins`,
      changeFrequency: 'weekly',
      priority: 0.6
    }
  ))

  let site_urls = [
    {
      url: process.env.BASE_URL,
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: accounts_url,
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: bulletins_url,
      changeFrequency: 'daily',
      priority: 1
    }
  ]
  return [...site_urls, ...account_urls, ...bulletin_urls, ...bulletin_json_urls]
}