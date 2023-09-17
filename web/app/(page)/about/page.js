import Link from "next/link"

export default function Bulletins(props) {
  return (
    <div>
      <div>
        <p>1、本站</p>
        <p>本站服务地址：{process.env.SERVICE_URL}</p>
        <p>本站服务账号：{process.env.SERVICE_ADDRESS}</p>
        <p>{`{"URL": "${process.env.SERVICE_URL}", "Address": "${process.env.SERVICE_ADDRESS}"}`}</p>
        <p></p>
        <p></p>
      </div>
      <div>
        <p>2、发帖App</p>
        <p><Link href={`https://github.com/oxogenesis/oxo-chat-app/releases`} className="font-bold bg-yellow-500 rounded-md px-1">App下载（on android推荐）</Link></p>
        <p><Link href={`https://github.com/oxogenesis/oxo-chat-client/releases`} className="font-bold bg-yellow-500 rounded-md px-1">Client下载（electron on windows不推荐）</Link></p>
        <p>使用App或Client，设置服务地址{process.env.SERVICE_URL}，即可连接服务器发布帖子</p>
        <p>网站不提供账号注册或发布帖子服务，只提供展示帖子服务</p>
        <p>主要原因是账号发布帖子需要使用账号密钥签名，密钥存在个人设备中才能保障个人对账号的绝对控制</p>
      </div>
      <div>
        <p>3、扫码关注</p>
        <p>使用App扫帖子页面的二维码，可以关注账户</p>
        <p>使用Client输入帖子账户地址，可以关注账户</p>
      </div>
      <div>
        <p><Link href={`https://github.com/oxogenesis/oxo-chat-server#deploy-with-ssl-nginx-pm2`} className="font-bold bg-yellow-500 rounded-md px-1">4、自建站点</Link></p>
        <p></p>
        <p></p>
      </div>
    </div >
  )
}

