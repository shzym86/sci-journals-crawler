const fs = require("fs")
const puppeteer = require('puppeteer')
const mongoose = require('mongoose')

// 初始化collection的数据结构
const schema = new mongoose.Schema({
  issn: String,
  year: String,
  submissions: String,
  accepted: String,
  acceptance_rate: String,
  dateCrawled: String
});

// 生成collection模型
const acceptance = mongoose.model('acceptance', schema);

// 封装保存数据的函数
function upsertAcceptance(obj) {
  // 连接数据库
  const DB_URL = 'mongodb://localhost/crawler';
  if (mongoose.connection.readyState == 0) {
    mongoose.connect(DB_URL);
  }
  // 如果ISSN存在，就更新实例，不新增
  const conditions = {
    issn: obj.issn
  };
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  };
  // 将数据写入acceptances集合中
  acceptance.findOneAndUpdate(conditions, obj, options, (err, result) => {
    if (err) {
      throw err;
    }
  });
}

// 封装运行函数
async function run(src) {
  // 初始化
  let start = Date.now();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  // 读取待抓取的期刊ISSN列表
  console.log("正在读取期刊列表，请稍后……");
  let journals = fs.readFileSync(src, "utf-8").split("\r\n");
  let quantity = journals.length;
  console.log(`待抓取期刊列表读取成功，共${quantity}条！`);
  // 遍历URL
  for (let i = 0; i < quantity; i++) {
    // 获取抓取期刊的URL
    let journal = journals[i];
    let url = `https://journalinsights.elsevier.com/journals/${journal}/acceptance_rate`;
    await page.goto(url, {
      timeout: 0,
      waitUntil: "domcontentloaded"
    });
    // 解析页面，结果返回为一个对象
    let SELECTOR = ".count4columns>tbody>tr:nth-child(1)>td";
    let result = await page.evaluate(($sel, issn) => {
      // 注意只有在evaluate方法中才有document
      let info = [...document.querySelectorAll($sel)];
      // 如果访问的是404就不处理
      if (info.length > 0) {
        let year = info[0].innerText;
        let submissions = info[1].innerText;
        let accepted = info[2].innerText;
        let acceptance_rate = info[3].innerText;
        let dateCrawled = new Date().toLocaleString();
        return {
          issn,
          year,
          submissions,
          accepted,
          acceptance_rate,
          dateCrawled
        }
      } else {
        return false;
      }
    }, SELECTOR, journal);
    // 处理数据并显示提示信息
    if (result) {
      // 将数据保存至MongoDB数据库
      upsertAcceptance(result);
      console.log(`${i + 1} - 期刊${journal}数据抓取完成！`);
    } else {
      console.log(`${i + 1} - 期刊${journal}无数据！Error 404！`);
    }
    // 执行完一次循环等待1s
    await page.waitFor(1000);
  }
  // 完成并计算用时
  browser.close();
  let end = Date.now();
  let time = parseInt((end - start) / 1000);
  let minute = parseInt(time / 60);
  let second = parseInt(time % 60);
  console.log(`抓取完成！总计用时：${minute}分${second}秒`);
  // 断开数据库连接
  mongoose.disconnect();
}

// 执行程序，参数为待抓取列表文件
run("issn-elsevier.txt");