import { NextResponse } from "next/server"
import { PrismaClient } from '@prisma/client'
import { Json2Str } from '@/lib/Util'

const prisma = new PrismaClient()

export async function GET(request, props) {
  const params = await props.params;
  // console.log(`=============================>>>0`)
  const { hash = "" } = params
  try {
    let bulletin = await prisma.BULLETINS.findFirst({
      where: {
        hash: hash,
      },
      select: {
        json: true
      }
    })
    return NextResponse.json({ bulletin: bulletin })
    // return res.status(200).json(data)
  } catch (error) {
    // console.log(`=============================3`)
    console.log(error)
    return NextResponse.json({ error })
  }
}