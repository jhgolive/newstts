const express = require("express");
const cors = require("cors");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const say = require("say");
const fetch = require("node-fetch"); // node-fetch 설치 필요

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

let lastNews = "뉴스 로딩 중...";
const parser = new xml2js.Parser({ explicitArray: false });

// 가져올 RSS URL
const CATEGORY_RSS = [
  "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", // 헤드라인
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko" // 대한민국
  // 필요하면 추가
];

// RSS fetch + parse
async function fetchRSS(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();
    const result = await parser.parseStringPromise(xml);
    const items = Array.isArray(result.rss.channel.item)
      ? result.rss.channel.item
      : [result.rss.channel.item];
    return items;
  } catch (err) {
    console.error("RSS fetch/parse 실패:", url, err);
    return [];
  }
}

// 전체 뉴스 가져오기
async function fetchAllNews() {
  try {
    const promises = CATEGORY_RSS.map(url => fetchRSS(url));
    const results = await Promise.all(promises);
    const allItems = results.flat();
    lastNews = allItems.map(i => i.title).join("   |   ");
    console.log(`✅ 총 뉴스 ${allItems.length}개 가져옴`);
  } catch (err) {
    console.error("전체 뉴스 가져오기 실패", err);
    lastNews = "뉴스 로딩 실패 😢";
  }
}

// 초기 로드 + 10분마다 갱신
fetchAllNews();
setInterval(fetchAllNews, 600000);

// TTS mp3 생성
app.get("/news-tts", async (req, res) => {
  try {
    const fileName = "news.mp3";
    const filePath = path.join(__dirname, fileName);

    await new Promise((resolve, reject) => {
      say.export(lastNews, null, 1.0, filePath, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", "inline; filename=news.mp3");
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("TTS 생성 실패", err);
    res.status(500).send("TTS 생성 실패 😢");
  }
});

app.get("/news", (req, res) => {
  res.json({ news: lastNews });
});

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
