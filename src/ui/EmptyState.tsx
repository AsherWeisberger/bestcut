import { useRef, useState } from "react";
import { useEditor } from "../store";

export function EmptyState() {
  const input = useRef<HTMLInputElement>(null);
  const importFiles = useEditor((s) => s.importFiles);
  const [hot, setHot] = useState(false);

  const take = (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    importFiles([...files]);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-col">
          <div className="mark">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="7" width="22" height="18" rx="2" stroke="#D9CCAC" strokeWidth="1.6" />
              <path d="M13 12.2v7.6L20.4 16 13 12.2z" fill="#D9CCAC" />
            </svg>
            <span className="word">
              Best<i>Cut</i>
            </span>
          </div>
          <a className="byline" href="https://x.com/AsherWeisberger" rel="noopener noreferrer">
            <span className="who">Made by Asher Weisberger · </span>@AsherWeisberger
          </a>
        </div>
      </header>
      <div className="empty">
        <div className="empty-in">
          <div className="kicker">In the tab · On the phone</div>
          <h1>
            Cut it <em>here.</em>
          </h1>
          <p className="lead">
            A local editor for TikTok, YouTube, Instagram, Facebook, and LinkedIn. Split the miss, title it, caption it, export. Bytes stay in this browser.
          </p>
          <div
            className={`drop ${hot ? "hot" : ""}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => {
              e.preventDefault();
              setHot(false);
              take(e.dataTransfer.files);
            }}
          >
            <div className="gate">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M8 6.5v11l9-5.5-9-5.5z" fill="#D9CCAC" />
              </svg>
            </div>
            <h2>Drop video, stills, or audio</h2>
            <p>Camera roll on phone. Files stay local. No account.</p>
            <input
              ref={input}
              className="sr"
              type="file"
              accept="video/*,audio/*,image/*,.mp4,.mov,.webm,.mp3,.wav,.m4a,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={(e) => take(e.target.files)}
            />
          </div>
          <div className="steps">
            <div>
              <b>01</b>
              <span>Drop a talking head</span>
            </div>
            <div>
              <b>02</b>
              <span>Split · title · auto caption</span>
            </div>
            <div>
              <b>03</b>
              <span>Export MP4 that plays</span>
            </div>
          </div>
          <p className="credit">
            Made by Asher Weisberger ·{" "}
            <a href="https://x.com/AsherWeisberger" rel="noopener noreferrer">
              @AsherWeisberger
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
