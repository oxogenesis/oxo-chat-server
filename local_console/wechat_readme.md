# 下载md文件
使用[wechatDownload](https://github.com/qiye45/wechatDownload)，只勾选导出MD文件、文件开头添加日期两项，然后按照使用说明批量下载文章  
对于写了多年文章的公众号可能无法一次全部下载完，可能需要多次才能完成，注意观察该公众号下载文件夹中md文件名的日期，直到程序持续提示延迟xx秒后继续  

# 生成Bulletin数据库
1. 配置wechat_gen_db.js的PostPath和Seed变量  
    1. PostPath为上一步文章md文件的文件夹  
    2. Seed为发布Bulletin的种子，可以指定，也取消下一行注释随机生成一个  
2. 运行node wechat_gen_db.js，可生产一个以Seed为种子的账号为文件名的数据库文件  

# 上传Bulletin
1. wechat_upload.js的Seed变量，上一步使用的Seed  
2. 运行node wechat_upload.js，程序会读取上一步生成数据库中的Bulletin，连接服务器进行上传  
