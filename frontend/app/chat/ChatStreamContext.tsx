import React, {createContext, useContext, useState, useRef, useCallback, ReactNode} from "react";
import {useHttpStream} from "./useHttpStream";

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    partial?: boolean;
};

export type Suggestion = string;

interface ChatStreamContextType {
    messages: ChatMessage[];
    suggestions: Suggestion[];
    sendMessage: (prompt: string) => Promise<void>;
    loading: boolean;
}

const ChatStreamContext = createContext<ChatStreamContextType | undefined>(undefined);

export const useChatStream = () => {
    const ctx = useContext(ChatStreamContext);
    if (!ctx) throw new Error("useChatStream must be used within ChatStreamProvider");
    return ctx;
};

export const ChatStreamProvider = ({children}: { children: ReactNode }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const assistantMsgIdRef = useRef<string | null>(null);
    const contentBufferRef = useRef<string>("");
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

    // Streaming callbacks
    const handleChunk = useCallback((line: string) => {
        try {
            const data = JSON.parse(line);
            if (data.type === "partial_response") {
                if (typeof data.value === "string" && assistantMsgIdRef.current) {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === assistantMsgIdRef.current
                                ? {...msg, content: (msg.content || "") + data.value, partial: true}
                                : msg
                        )
                    );
                }
            } else if (data.type === "response") {
                if (typeof data.value === "string" && assistantMsgIdRef.current) {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === assistantMsgIdRef.current
                                ? {...msg, content: data.value, partial: false}
                                : msg
                        )
                    );
                }
            } else if (data.type === "suggestions") {
                setSuggestions(data.value || []);
            }
        } catch (e) {
            // Ignore JSON parse errors for incomplete lines
        }
    }, []);

    const handleDone = useCallback(() => {
        if (assistantMsgIdRef.current) {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantMsgIdRef.current
                        ? {...msg, partial: false}
                        : msg
                )
            );
        }
        contentBufferRef.current = "";
        assistantMsgIdRef.current = null;
    }, []);

    const handleError = useCallback((err: Error) => {
        if (assistantMsgIdRef.current) {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantMsgIdRef.current
                        ? {...msg, content: `[Error: failed to fetch response]`, partial: false}
                        : msg
                )
            );
        }
        contentBufferRef.current = "";
        assistantMsgIdRef.current = null;
    }, []);

    // State to trigger streaming with a new prompt
    const [streamPrompt, setStreamPrompt] = useState<string | null>(null);

    // useHttpStream hook instance
    const {
        start: startStream,
        abort: abortStream,
        loading,
    } = useHttpStream({
        url: "/api/stream",
        options: {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({prompt: streamPrompt}),
        },
        onChunk: handleChunk,
        onDone: handleDone,
        onError: handleError,
    });

    // sendMessage implementation
    const sendMessage = useCallback(async (prompt: string) => {
        abortStream();
        setSuggestions([]);
        const userMsg: ChatMessage = {
            id: `${Date.now()}-user`,
            role: "user",
            content: prompt,
        };
        setMessages((prev) => [...prev, userMsg]);
        const assistantMsg: ChatMessage = {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            content: "",
            partial: true,
        };
        assistantMsgIdRef.current = assistantMsg.id;
        contentBufferRef.current = "";
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamPrompt(prompt);
        setTimeout(() => {
            startStream();
        }, 0);
    }, [abortStream, startStream]);

    return (
        <ChatStreamContext.Provider value={{messages, suggestions, sendMessage, loading}}>
            {children}
        </ChatStreamContext.Provider>
    );
};
