import express from "express";
import cors from "cors";
import xml2js from "xml2js";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import textToSpeech from "@google-cloud/text-to-speech";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static("public"));

let lastNews = "뉴스 로딩 중...";
const parser = new xml2js.Parser({ explicitArray: false });

// ✅ 클라우드 환경용: 환경변수 GOOGLE_CREDENTIALS 사용
if (process.env.GOOGLE_CREDENTIALS) {
  fs.writeFileSync("/tmp/google-credentials.json", process.env.GOOGLE_CREDENTIALS);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/google-credentials.json";
}

// Google Cloud TTS 클라이언트
const ttsClient = new textToSpeech.TextToSpeechClient();

// 카테고리 RSS URL
const CATEGORY_RSS = [
  "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko" // 헤드라인
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

// 초기 로드 + 50분마다 갱신
fetchAllNews();
setInterval(fetchAllNews, 3000000);

// 뉴스 JSON
app.get("/news", (req, res) => {
  res.json({ news: lastNews });
});

// Google Cloud TTS
app.get("/news-tts", async (req, res) => {
  try {
    const request = {
      input: { text: lastNews },
      voice: { languageCode: "ko-KR", ssmlGender: "FEMALE" },
      audioConfig: { audioEncoding: "MP3" },
    };
    const [response] = await ttsClient.synthesizeSpeech(request);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.audioContent.length,
    });
    res.send(response.audioContent);

  } catch (err) {
    console.error("Google Cloud TTS 실패", err);
    res.status(500).send("TTS 생성 실패 😢");
  }
});

// 루트
app.get("/", (req, res) => 
  res.sendFile(path.join(process.cwd(), "public/index.html"))
);

app.listen(PORT, () => 
  console.log(`✅ Server running on port ${PORT}`)
);
