"use client";

import { useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import { parseHealthXML } from "@/lib/parser/xmlParser";
import { saveHealthData } from "@/lib/db/indexedDB";
import { useHealthStore } from "@/stores/healthStore";

export function FileUpload() {
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { isLoading, parseProgress, setLoading, setParseProgress, setData } =
    useHealthStore();

  const processFile = useCallback(
    async (file: File) => {
      setError("");
      setLoading(true);
      setStatus("Reading file...");

      try {
        let xmlText: string;

        if (file.name.endsWith(".zip")) {
          setStatus("Extracting ZIP...");
          const zip = await JSZip.loadAsync(file);
          const xmlFile =
            zip.file("apple_health_export/export.xml") ||
            zip.file("export.xml");
          if (!xmlFile) {
            throw new Error("No export.xml found in ZIP archive");
          }
          setStatus("Decompressing XML...");
          xmlText = await xmlFile.async("string");
        } else if (file.name.endsWith(".xml")) {
          xmlText = await file.text();
        } else {
          throw new Error("Please upload a .zip or .xml file");
        }

        setStatus(`Parsing ${(xmlText.length / 1024 / 1024).toFixed(0)}MB of health data...`);

        parseHealthXML(
          xmlText,
          (percent) => {
            setParseProgress(percent);
            if (percent < 90) {
              setStatus(`Parsing records... ${percent}%`);
            } else {
              setStatus("Computing daily summaries...");
            }
          },
          async (result) => {
            setStatus("Saving to local database...");
            await saveHealthData(result.summaries, result.sleepNights, result.meta);
            setData(result.summaries, result.sleepNights, result.meta);
            setStatus("");
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process file");
        setLoading(false);
      }
    },
    [setLoading, setParseProgress, setData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="w-full max-w-lg mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragOver
            ? "border-accent bg-accent/5 scale-[1.02]"
            : "border-card-border hover:border-muted"
          }
          ${isLoading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.xml"
          onChange={handleFileSelect}
          className="hidden"
        />

        {!isLoading ? (
          <>
            <div className="text-4xl mb-4">
              <svg className="w-12 h-12 mx-auto text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-foreground font-medium mb-1">
              Drop your Apple Health export here
            </p>
            <p className="text-muted text-sm">
              .zip or .xml file from iPhone → Health → Export All Health Data
            </p>
          </>
        ) : (
          <div>
            <p className="text-foreground font-medium mb-3">{status}</p>
            <div className="w-full bg-card rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
                style={{ width: `${parseProgress}%` }}
              />
            </div>
            <p className="text-muted text-sm mt-2">{parseProgress}%</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-danger text-sm text-center mt-4">{error}</p>
      )}
    </div>
  );
}
