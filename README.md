# oxo-chat-server
oxo消息服务器
* 消息转发功能
* 公告缓存功能
* 简单的网站功能（在线账户列表、公告展示）

**[https://oxo-chat-server.com/](https://oxo-chat-server.com/)**  

# code

**[app](https://github.com/oxogenesis/oxo-chat-app)**  
**[client](https://github.com/oxogenesis/oxo-chat-client)**  
**[server](https://github.com/oxogenesis/oxo-chat-server)**  

# wiki
**[1.关于密码学](https://github.com/oxogenesis/oxo-chat-client/wiki/1.%E5%85%B3%E4%BA%8E%E5%AF%86%E7%A0%81%E5%AD%A6)**  
**[2.系统描述](https://github.com/oxogenesis/oxo-chat-client/wiki/2.%E7%B3%BB%E7%BB%9F%E6%8F%8F%E8%BF%B0)**  
**[3.业务消息](https://github.com/oxogenesis/oxo-chat-client/wiki/3.%E4%B8%9A%E5%8A%A1%E6%B6%88%E6%81%AF)**  
**[4.数据存储](https://github.com/oxogenesis/oxo-chat-client/wiki/4.%E6%95%B0%E6%8D%AE%E5%AD%98%E5%82%A8)**  

# node version
$ nvm list  
  * 22.12.0 (Currently using 64-bit executable)  

# run code
//start service  
cd oxo-chat-server/service  
npm install  
node main.js  

//start web  
cd ../web  
npm install  
npm run dev  

# deploy with ssl, nginx, pm2, pg, Ubuntu 22.04
apt install nginx  
ufw allow 'Nginx Full'  
ufw allow 22/tcp  
ufw enable  
ufw status  

add-apt-repository ppa:certbot/certbot  
apt update  
apt install python-certbot-nginx  

certbot --nginx -d oxo-chat-server.com -d ru.oxo-chat-server.com  
Enter your email address  
Enter “A” for Agree  
Enter “Y” for Yes  
Enter “2”  
sudo certbot renew --dry-run  
  
mv /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup  
nano /etc/nginx/sites-available/default  
  
```
#https on 80 from localhost:8000
server {  
  listen 443 ssl;  
  server_name oxo-chat-server.com;  
  ssl_certificate /etc/letsencrypt/live/oxo-chat-server.com/fullchain.pem;  
  ssl_certificate_key /etc/letsencrypt/live/oxo-chat-server.com/privkey.pem;  
  ssl_protocols TLSv1.2;  
  ssl_prefer_server_ciphers on;  
  ssl_ciphers EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH;  
  
  server_name localhost;  
  location / {
    proxy_pass http://localhost:3000;  
    proxy_http_version 1.1;  
    proxy_set_header Host $http_host;  
    proxy_set_header X-Real-IP $remote_addr;  
    proxy_set_header X-Forward-For $proxy_add_x_forwarded_for;  
    proxy_set_header X-Forward-Proto http;  
    proxy_set_header X-Nginx-Proxy true;  
    proxy_redirect off;  
  }
}
  
server {  
  listen 80;  
  server_name oxo-chat-server.com;  
  return 301 https://$host$request_uri;  
}  
  

#wss on 80 from localhost:3000
server {  
  listen 443 ssl;  
  server_name ru.oxo-chat-server.com;  
  ssl_certificate /etc/letsencrypt/live/oxo-chat-server.com/fullchain.pem;  
  ssl_certificate_key /etc/letsencrypt/live/oxo-chat-server.com/privkey.pem;  
  ssl_protocols TLSv1.2;  
  ssl_prefer_server_ciphers on;  
  ssl_ciphers EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH;  
  root /usr/share/nginx/html;  
  index index.html index.htm;  
  
  server_name localhost;  
  location / {
    proxy_pass http://localhost:8000/;  
    proxy_http_version 1.1;  
    proxy_set_header Upgrade $http_upgrade;  
    proxy_set_header Connection "upgrade";  
    proxy_set_header Host $http_host;  
    proxy_set_header X-Real-IP $remote_addr;  
    proxy_connect_timeout 1d;  
    proxy_send_timeout 1d;  
    proxy_read_timeout 1d;  
  }
}
  
server {  
  listen 80;  
  server_name ru.oxo-chat-server.com;  
  return 301 https://$host$request_uri;  
}  
```

//nvm  
curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash  
source ~/.profile  
nvm install 22.12.0  
npm install -g pm2  

//pg  
apt install postgresql postgresql-contrib  
psql -V  
psql (PostgreSQL) 14.9 (Ubuntu 14.9-0ubuntu0.22.04.1)  
su - postgres  
psql  
\l  
\conninfo  
\password postgres  
create database oxo  
\q  

//start service  
git clone https://github.com/oxogenesis/oxo-chat-server  
cd oxo-chat-server/service  
npm install  
npx prisma generate  
npx prisma migrate dev  
npx prisma migrate deploy  
pm2 start main.js --name "service"  

//start web  
cd ../web  
npm install  
npm run build  
pm2 start npm --name web -- run start -- -p 3000  

pm2 save  
pm2 startup systemd  
