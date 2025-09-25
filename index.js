import express from "express";
import cors from "cors";
import xml2js from "xml2js";
import fetch from "node-fetch";
import path from "path";
import googleTTS from "google-tts-api";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static("public")); // 정적 파일 제공

let lastNews = "뉴스 로딩 중...";
const parser = new xml2js.Parser({ explicitArray: false });

const CATEGORY_RSS = [
  "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko" // 헤드라인
  //"https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko" // 대한민국
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

// 뉴스 JSON
app.get("/news", (req, res) => {
  res.json({ news: lastNews });
});

// TTS mp3 제공 (google-tts-api URL 리다이렉트)
app.get("/news-tts", async (req, res) => {
  try {
    const url = googleTTS.getAudioUrl(lastNews, {
      lang: "ko",
      slow: false,
      host: "https://translate.google.com",
    });
    res.redirect(url);
  } catch (err) {
    console.error("TTS 생성 실패", err);
    res.status(500).send("TTS 생성 실패 😢");
  }
});

// 루트
app.get("/", (req, res) => res.sendFile(path.join(process.cwd(), "public/index.html")));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
