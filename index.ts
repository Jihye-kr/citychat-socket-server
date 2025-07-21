import http from "http";
import dotenv from "dotenv";
import express from "express";
import { Server } from "socket.io";
import { Chat } from "./src/types";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Supabase 클라이언트 설정
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://citychat-beta.vercel.app", // 프론트엔드 주소
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  const roomId = socket.handshake.query.roomId as string;

  socket.join(roomId);
  console.log(`✅ User connected to room ${roomId}`);

  socket.on("sendMessage", async (msg: Chat) => {
    const { content, tags, sender, senderId, replyToId, sentAt } = msg;
    // 서버에서 데이터베이스로 정보 저장 시작
    // 1. chats 테이블에 저장
    const { data: chatData, error: chatError } = await supabase
      .from("chats")
      .insert({
        content,
        content_type: "text",
        user_id: senderId,
        chat_room_id: parseInt(roomId),
        parent_chat_id: replyToId ?? null,
        sent_at: sentAt,
      })
      .select();

    if (chatError || !chatData) {
      console.error("❌ Chat 저장 실패:", chatError);
      return;
    }
    // 가장 마지막에 저장된 채팅 정보
    const savedChat = chatData[0];

    // 2. 태그가 있다면 chat_tags에 저장
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // 2-1. tag 존재 여부 확인
        const { data: existingTag } = await supabase
          .from("tags")
          .select("id, tag_name")
          .eq("tag_name", tagName)
          .maybeSingle();

        let tagId = existingTag?.id;

        // 2-2. 없으면 새로 생성
        if (!tagId) {
          const { data: newTag } = await supabase
            .from("tags")
            .insert({ tag_name: tagName })
            .select()
            .single();
          tagId = newTag?.id;
        }

        // 2-3. chat_tags에 연결 저장
        await supabase.from("chat_tags").insert({
          chat_id: savedChat.id,
          tag_id: tagId,
        });
      }
    }
    console.log("sackedChat:", savedChat),
      // 3. 모든 클라이언트에 전송
      io.to(roomId).emit("receiveMessage", {
        id: savedChat.id,
        content,
        tags,
        sender,
        senderId,
        sent_at: savedChat.sent_at,
        replyToId,
      });
  });

  // 유저가 채팅방 나감
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected from room ${roomId}`);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
