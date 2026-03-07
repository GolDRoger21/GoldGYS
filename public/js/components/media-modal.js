// js/components/media-modal.js
// Handles displaying media content in a modal for the application

if (!window.formatMediaTime) {
    window.formatMediaTime = function (time) {
        if (!Number.isFinite(time) || time <= 0) return '0:00';
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };
}

if (!window.initCustomAudioPlayer) {
    window.initCustomAudioPlayer = function (audioUrl) {
        const audioEl = document.getElementById('customPodcastAudio');
        const playBtn = document.getElementById('podcastPlayBtn');
        const playIcon = document.getElementById('podcastPlayIcon');
        const speedBtn = document.getElementById('podcastSpeedBtn');
        const track = document.getElementById('podcastProgressTrack');
        const fill = document.getElementById('podcastProgressFill');
        const currentTimeEl = document.getElementById('podcastCurrentTime');
        const totalTimeEl = document.getElementById('podcastTotalTime');

        if (!audioEl || !playBtn || !playIcon || !track || !fill) return;

        audioEl.src = audioUrl;
        audioEl.load();
        audioEl.play().catch(() => {
            playIcon.className = 'fas fa-play';
        });

        const updateProgress = () => {
            const duration = (!Number.isFinite(audioEl.duration) || isNaN(audioEl.duration)) ? 0 : audioEl.duration;
            const current = audioEl.currentTime || 0;
            const percent = duration > 0 ? (current / duration) * 100 : 0;
            fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
            if (currentTimeEl) currentTimeEl.innerText = window.formatMediaTime(current);
            if (totalTimeEl && duration > 0) totalTimeEl.innerText = window.formatMediaTime(duration);
        };

        playBtn.onclick = function () {
            if (audioEl.paused) {
                audioEl.play().catch(() => { });
            } else {
                audioEl.pause();
            }
        };

        track.onclick = function (event) {
            const duration = audioEl.duration || 0;
            if (duration <= 0) return;
            const rect = track.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            audioEl.currentTime = ratio * duration;
            updateProgress();
        };

        if (speedBtn) {
            speedBtn.onclick = function () {
                const speedSteps = [1, 1.25, 1.5, 2, 0.75];
                const currentIndex = speedSteps.indexOf(audioEl.playbackRate);
                const nextSpeed = speedSteps[(currentIndex + 1) % speedSteps.length] || 1;
                audioEl.playbackRate = nextSpeed;
                speedBtn.innerText = `${nextSpeed}x`;
            };
        }

        audioEl.onplay = () => {
            playIcon.className = 'fas fa-pause';
        };
        audioEl.onpause = () => {
            playIcon.className = 'fas fa-play';
        };
        audioEl.onended = () => {
            playIcon.className = 'fas fa-play';
            fill.style.width = '100%';
        };
        audioEl.ontimeupdate = updateProgress;
        audioEl.onloadedmetadata = updateProgress;
        audioEl.onerror = () => {
            playIcon.className = 'fas fa-exclamation-triangle';
        };
    };
}

window.openMaterialModal = function (encodedData) {
    try {
        const mat = JSON.parse(decodeURIComponent(encodedData));
        const overlay = document.getElementById('mediaModalOverlay');
        const titleEl = document.getElementById('mediaModalTitle');
        const bodyEl = document.getElementById('mediaModalBody');
        const fullscreenBtn = document.getElementById('mediaModalFullscreenBtn');

        titleEl.textContent = mat.title || 'Materyal';
        bodyEl.innerHTML = '';

        // Show fullscreen button only for iframe-capable media
        if (mat.type === 'video' || (mat.type === 'pdf' && mat.url && mat.url.includes('drive.google.com/file/d/'))) {
            fullscreenBtn.style.display = 'flex';
        } else {
            fullscreenBtn.style.display = 'none';
        }

        if (mat.type === 'video') {
            let embedUrl = mat.url;
            if (mat.url.includes('youtube.com/watch') || mat.url.includes('youtu.be/')) {
                const videoId = mat.url.split('v=')[1]?.split('&')[0] || mat.url.split('youtu.be/')[1]?.split('?')[0];
                if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&showinfo=0`;
            } else if (mat.url.includes('vimeo.com/')) {
                const videoId = mat.url.split('vimeo.com/')[1];
                if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1`;
            }
            bodyEl.innerHTML = `
            <div class="media-responsive-iframe">
                <iframe src="${embedUrl}" sandbox="allow-scripts allow-same-origin allow-presentation" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
            `;
        } else if (mat.type === 'podcast') {
            if (mat.url.includes('spotify.com')) {
                bodyEl.innerHTML = `<iframe src="${mat.url.replace('/episode/', '/embed/episode/')}" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
            } else if (mat.url.includes('youtube.com') || mat.url.includes('youtu.be/')) {
                const videoId = mat.url.includes('v=') ? mat.url.split('v=')[1]?.split('&')[0] : mat.url.split('youtu.be/')[1]?.split('?')[0];
                if (videoId) {
                    // Kompakt Yatay Podcast Player Tasarımı
                    bodyEl.innerHTML = `
                        <style>
                        .custom-yt-audio-player { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 15px; padding: 12px 20px; background: var(--bg-card); border-radius: 50px; border: 1px solid var(--border-color); box-shadow: 0 4px 15px rgba(0,0,0,0.08); margin-top: 15px; width: 100%; box-sizing: border-box; transition: background 0.3s, border-color 0.3s; }
                        .yt-play-btn { width: 44px; height: 44px; min-width: 44px; border-radius: 50%; background: var(--primary-color, #E0A352); color: #fff; border: none; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; cursor: pointer; transition: transform 0.2s, background 0.2s, box-shadow 0.2s; box-shadow: 0 4px 12px rgba(224, 163, 82, 0.3); }
                        .yt-play-btn:hover { transform: scale(1.08); box-shadow: 0 6px 16px rgba(224, 163, 82, 0.5); }
                        .yt-progress-container { flex: 1; display: flex; align-items: center; gap: 10px; width: 100%; overflow: hidden; }
                        .yt-time-display { font-size: 0.8rem; color: var(--text-color); font-variant-numeric: tabular-nums; min-width: 35px; text-align: center; font-weight: 500; opacity: 0.8; }
                        .yt-custom-progress-track { flex: 1; height: 6px; background-color: var(--border-color); border-radius: 4px; cursor: pointer; position: relative; transition: height 0.2s; }
                        .yt-custom-progress-track:hover { height: 8px; }
                        .yt-custom-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; height: 100%; background-color: var(--primary-color, #E0A352); border-radius: 4px; width: 0%; pointer-events: none; z-index: 1; }
                        .yt-custom-progress-thumb { position: absolute; right: -7px; top: 50%; transform: translateY(-50%) scale(0); width: 14px; height: 14px; background-color: var(--primary-color, #E0A352); border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.5); transition: transform 0.2s; pointer-events: none; z-index: 2; }
                        .yt-custom-progress-track:hover .yt-custom-progress-thumb { transform: translateY(-50%) scale(1); }
                        .yt-speed-btn { background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-color); padding: 5px 12px; border-radius: 15px; font-size: 0.8rem; cursor: pointer; font-weight: 600; transition: all 0.2s; white-space: nowrap; }
                        .yt-speed-btn:hover { border-color: var(--primary-color, #E0A352); color: var(--primary-color, #E0A352); background: transparent; }
                        
                        @media (max-width: 420px) {
                            .custom-yt-audio-player { padding: 10px 15px; gap: 10px; }
                            .yt-play-btn { width: 38px; height: 38px; min-width: 38px; font-size: 1rem; }
                            .yt-time-display { font-size: 0.75rem; min-width: 30px; }
                            .yt-speed-btn { padding: 4px 10px; font-size: 0.75rem; }
                        }
                        </style>
                        <div class="custom-yt-audio-player">
                            <button class="yt-play-btn" id="ytPlayBtn" onclick="toggleYtPlay()">
                                <i class="fas fa-spinner fa-spin" id="ytPlayIcon"></i>
                            </button>
                            <div class="yt-progress-container">
                                <span class="yt-time-display" id="ytCurrentTime">0:00</span>
                                <div class="yt-custom-progress-track" id="ytProgressTrack">
                                    <div class="yt-custom-progress-fill" id="ytProgressFill">
                                        <div class="yt-custom-progress-thumb"></div>
                                    </div>
                                </div>
                                <span class="yt-time-display" id="ytTotalTime">0:00</span>
                            </div>
                            <button class="yt-speed-btn" id="ytSpeedBtn" onclick="toggleYtSpeed()" title="Oynatma Hızı">1x</button>
                        </div>
                        <div id="ytHiddenPlayer" style="position:absolute; width:1px; height:1px; top:-9999px; left:-9999px; opacity:0; pointer-events:none;"></div>
                    `;

                    if (!window.initCustomYtPlayer) {
                        window.initCustomYtPlayer = function (vid) {
                            if (window.ytProgressInterval) clearInterval(window.ytProgressInterval);
                            const loadPlayer = () => {
                                window.currentYtPlayer = new YT.Player('ytHiddenPlayer', {
                                    height: '0', width: '0', videoId: vid,
                                    playerVars: { 'autoplay': 1, 'controls': 0, 'playsinline': 1 },
                                    events: {
                                        'onReady': (event) => {
                                            const playIcon = document.getElementById('ytPlayIcon');
                                            if (playIcon) playIcon.className = 'fas fa-pause';

                                            let initialDuration = window.currentYtPlayer.getDuration() || 0;
                                            document.getElementById('ytTotalTime').innerText = window.formatYtTime(initialDuration);

                                            const track = document.getElementById('ytProgressTrack');
                                            const fill = document.getElementById('ytProgressFill');

                                            // Custom click to seek logic
                                            track.addEventListener('click', function (e) {
                                                if (window.currentYtPlayer && typeof window.currentYtPlayer.seekTo === 'function') {
                                                    let duration = window.currentYtPlayer.getDuration() || 0;
                                                    if (duration > 0) {
                                                        const rect = track.getBoundingClientRect();
                                                        const clickX = e.clientX - rect.left;
                                                        const percent = Math.max(0, Math.min(1, clickX / rect.width));
                                                        window.currentYtPlayer.seekTo(percent * duration, true);
                                                        fill.style.width = `${percent * 100}%`;
                                                    }
                                                }
                                            });

                                            window.ytProgressInterval = setInterval(() => {
                                                if (window.currentYtPlayer && window.currentYtPlayer.getCurrentTime && typeof window.currentYtPlayer.getDuration === 'function') {
                                                    let current = window.currentYtPlayer.getCurrentTime() || 0;
                                                    let dur = window.currentYtPlayer.getDuration() || 0;

                                                    let elCur = document.getElementById('ytCurrentTime');
                                                    if (elCur) elCur.innerText = window.formatYtTime(current);

                                                    if (dur > 0 && fill) {
                                                        let progressPercent = (current / dur) * 100;
                                                        fill.style.width = `${progressPercent}%`;

                                                        const elTot = document.getElementById('ytTotalTime');
                                                        if (elTot && elTot.innerText == "0:00") {
                                                            elTot.innerText = window.formatYtTime(dur);
                                                        }
                                                    }
                                                }
                                            }, 100); // 100ms for much smoother visual updates
                                        },
                                        'onStateChange': (event) => {
                                            const playIcon = document.getElementById('ytPlayIcon');
                                            if (!playIcon) return;
                                            if (event.data == YT.PlayerState.PLAYING) {
                                                playIcon.className = 'fas fa-pause';
                                            } else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.ENDED) {
                                                playIcon.className = 'fas fa-play';
                                            }
                                        }
                                    }
                                });
                            };

                            if (!window.YT || !window.YT.Player) {
                                const tag = document.createElement('script');
                                tag.src = "https://www.youtube.com/iframe_api";
                                const firstScriptTag = document.getElementsByTagName('script')[0];
                                if (firstScriptTag && firstScriptTag.parentNode) {
                                    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                                } else {
                                    document.head.appendChild(tag);
                                }

                                let ytInterval = setInterval(() => {
                                    if (window.YT && window.YT.Player) {
                                        clearInterval(ytInterval);
                                        loadPlayer();
                                    }
                                }, 300);
                            } else {
                                loadPlayer();
                            }
                        };

                        window.toggleYtPlay = function () {
                            if (window.currentYtPlayer && window.currentYtPlayer.getPlayerState) {
                                let state = window.currentYtPlayer.getPlayerState();
                                if (state == YT.PlayerState.PLAYING) {
                                    window.currentYtPlayer.pauseVideo();
                                } else {
                                    window.currentYtPlayer.playVideo();
                                }
                            }
                        };

                        window.toggleYtSpeed = function () {
                            if (window.currentYtPlayer && window.currentYtPlayer.setPlaybackRate) {
                                let currentSpeed = window.currentYtPlayer.getPlaybackRate();
                                let newSpeed = 1;
                                if (currentSpeed === 1) newSpeed = 1.25;
                                else if (currentSpeed === 1.25) newSpeed = 1.5;
                                else if (currentSpeed === 1.5) newSpeed = 2;
                                else if (currentSpeed === 2) newSpeed = 0.75;
                                else if (currentSpeed === 0.75) newSpeed = 1;

                                window.currentYtPlayer.setPlaybackRate(newSpeed);
                                document.getElementById('ytSpeedBtn').innerText = newSpeed + 'x';
                            }
                        };

                        window.formatYtTime = function (time) {
                            if (!time) return "0:00";
                            let minutes = Math.floor(time / 60);
                            let seconds = Math.floor(time % 60);
                            return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
                        };
                    }
                    setTimeout(() => window.initCustomYtPlayer(videoId), 50);
                }
            } else if (mat.url.includes('drive.google.com/file/d/')) {
                const fileIdMatch = mat.url.match(/file\/d\/([^/]+)/);
                if (fileIdMatch && fileIdMatch[1]) {
                    const audioUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
                    bodyEl.innerHTML = `
                    <div class="media-responsive-iframe" style="padding-bottom: 0; min-height: 150px; height: 150px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
                        <iframe src="${audioUrl}" allow="autoplay" allowfullscreen style="border-radius: 12px; border: none; background: var(--bg-card);"></iframe>
                    </div>`;
                }
            } else {
                bodyEl.innerHTML = `
                <div class="media-podcast-container" style="background: var(--bg-card); padding: 16px 18px; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
                    <style>
                        .custom-podcast-player { display: flex; align-items: center; justify-content: space-between; gap: 15px; width: 100%; box-sizing: border-box; }
                        .podcast-play-btn { width: 44px; height: 44px; min-width: 44px; border: none; border-radius: 50%; color: #fff; background: var(--primary-color, #E0A352); box-shadow: 0 4px 12px rgba(224, 163, 82, 0.3); cursor: pointer; transition: transform 0.2s; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
                        .podcast-play-btn:hover { transform: scale(1.08); }
                        .podcast-timeline { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden; }
                        .podcast-time { font-size: 0.8rem; min-width: 35px; text-align: center; font-variant-numeric: tabular-nums; font-weight: 500; color: var(--text-color); opacity: 0.8; }
                        .podcast-progress-track { position: relative; flex: 1; height: 6px; border-radius: 4px; background: var(--border-color); cursor: pointer; transition: height 0.2s; }
                        .podcast-progress-track:hover { height: 8px; }
                        .podcast-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; height: 100%; width: 0%; background: var(--primary-color, #E0A352); border-radius: 4px; pointer-events: none; z-index: 1; }
                        .podcast-progress-thumb { position: absolute; right: -7px; top: 50%; transform: translateY(-50%) scale(0); width: 14px; height: 14px; background: var(--primary-color, #E0A352); border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.5); transition: transform 0.2s; pointer-events: none; z-index: 2; }
                        .podcast-progress-track:hover .podcast-progress-thumb { transform: translateY(-50%) scale(1); }
                        .podcast-speed-btn { background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 15px; padding: 5px 12px; font-weight: 600; font-size: 0.8rem; color: var(--text-color); white-space: nowrap; cursor: pointer; transition: all 0.2s; }
                        .podcast-speed-btn:hover { border-color: var(--primary-color, #E0A352); color: var(--primary-color, #E0A352); background: transparent; }
                    </style>
                    <div class="custom-podcast-player">
                        <button class="podcast-play-btn" id="podcastPlayBtn" type="button" aria-label="Oynat/Duraklat">
                            <i class="fas fa-spinner fa-spin" id="podcastPlayIcon"></i>
                        </button>
                        <div class="podcast-timeline">
                            <span class="podcast-time" id="podcastCurrentTime">0:00</span>
                            <div class="podcast-progress-track" id="podcastProgressTrack">
                                <div class="podcast-progress-fill" id="podcastProgressFill">
                                    <div class="podcast-progress-thumb"></div>
                                </div>
                            </div>
                            <span class="podcast-time" id="podcastTotalTime">0:00</span>
                        </div>
                        <button class="podcast-speed-btn" id="podcastSpeedBtn" type="button" title="Oynatma Hızı">1x</button>
                    </div>
                    <audio id="customPodcastAudio" preload="metadata" style="display:none"></audio>
                </div>`;
                setTimeout(() => window.initCustomAudioPlayer(mat.url), 20);
            }
        } else if (mat.type === 'html') {
            bodyEl.innerHTML = `<div class="media-html-content" style="padding-top:10px; color: var(--text-color);">${mat.content || mat.url || 'İçerik yüklenemedi.'}</div>`;
        } else if (mat.type === 'pdf') {
            if (mat.url && mat.url.includes('drive.google.com/file/d/')) {
                let embedUrl = mat.url;
                const fileIdMatch = mat.url.match(/file\/d\/([^/]+)/);
                if (fileIdMatch && fileIdMatch[1]) {
                    embedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
                }
                bodyEl.innerHTML = `
                <div class="media-responsive-iframe" style="padding-bottom: 0; min-height: 65vh; height: 100%; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                    <iframe src="${embedUrl}" allow="autoplay" allowfullscreen style="border-radius: 12px; border: none; background: var(--bg-card);"></iframe>
                </div>
                `;
            } else {
                bodyEl.innerHTML = `
                <div class="p-5 text-center mt-3" style="background: var(--bg-card); border: 1px dashed var(--border-color); border-radius:16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <div style="font-size:3rem; margin-bottom:15px; color: var(--text-muted); opacity:0.5;"><i class="fas fa-file-pdf"></i></div>
                    <div class="mb-4" style="color: var(--text-color); font-weight: 500;">Bu PDF belgesi doğrudan görüntülenemiyor, lütfen tarayıcıda yeni sekmede açın.</div>
                    <a href="${mat.url}" target="_blank" class="btn btn-primary" style="border-radius:30px; padding:10px 24px; font-weight: 600; box-shadow: 0 4px 12px rgba(224, 163, 82, 0.3); transition: transform 0.2s;"><i class="fas fa-external-link-alt mr-2"></i> PDF'i Görüntüle</a>
                </div>`;
            }
        } else {
            bodyEl.innerHTML = `
            <div class="p-5 text-center mt-3" style="background: var(--bg-card); border: 1px dashed var(--border-color); border-radius:16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="font-size:3rem; margin-bottom:15px; color: var(--text-muted); opacity:0.5;"><i class="fas fa-file-alt"></i></div>
                <div class="mb-4" style="color: var(--text-color); font-weight: 500;">Bu içerik türü doğrudan önizlenemiyor.</div>
                <a href="${mat.url}" target="_blank" class="btn btn-primary" style="border-radius:30px; padding:10px 24px; font-weight: 600; box-shadow: 0 4px 12px rgba(224, 163, 82, 0.3); transition: transform 0.2s;"><i class="fas fa-external-link-alt mr-2"></i> Yeni Sekmede Aç</a>
            </div>`;
        }

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (err) {
        console.error("Modal acilamadi", err);
        alert('Materyal görüntülenirken bir hata oluştu.');
    }
};

window.toggleMaterialFullscreen = function (event) {
    if (event) event.preventDefault();
    const bodyEl = document.getElementById('mediaModalBody');
    const iframeEl = bodyEl.querySelector('iframe');
    const targetEl = iframeEl || document.querySelector('.media-modal-container');

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (targetEl.requestFullscreen) {
            targetEl.requestFullscreen().catch(err => console.log(err));
        } else if (targetEl.webkitRequestFullscreen) {
            targetEl.webkitRequestFullscreen();
        } else if (targetEl.msRequestFullscreen) {
            targetEl.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
};

window.closeMaterialModal = function (event) {
    if (event) event.preventDefault();
    if (window.ytProgressInterval) {
        clearInterval(window.ytProgressInterval);
        window.ytProgressInterval = null;
    }
    if (window.currentYtPlayer && typeof window.currentYtPlayer.destroy === 'function') {
        try { window.currentYtPlayer.destroy(); } catch (e) { }
        window.currentYtPlayer = null;
    }
    const podcastAudioEl = document.getElementById('customPodcastAudio');
    if (podcastAudioEl) {
        podcastAudioEl.pause();
        podcastAudioEl.removeAttribute('src');
        podcastAudioEl.load();
    }
    const overlay = document.getElementById('mediaModalOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';

    setTimeout(() => {
        const bodyEl = document.getElementById('mediaModalBody');
        if (bodyEl) bodyEl.innerHTML = '';
    }, 300);
};

document.getElementById('mediaModalOverlay')?.addEventListener('click', function (e) {
    if (e.target === this) {
        window.closeMaterialModal();
    }
});
