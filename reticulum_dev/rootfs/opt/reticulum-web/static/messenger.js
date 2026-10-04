/* Original icon artwork: assets/n2k-icons.svg, CC0-1.0. */
function n2kIcon(name){
  const allowed=new Set(["overview", "radio", "mesh", "chat", "contacts", "status", "settings", "setup", "about", "more", "forward", "link"]);
  if(!allowed.has(name)) return "";
  return '<svg class="n2k-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="static/assets/n2k-icons.svg#'+name+'"></use></svg>';
}

/*
 * Netfreak2k Reticulum Messenger
 * 0.97.0 · External App Core
 */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    contacts: [],
    activeTab: "chats",
    contactQuery: "",
    contactFilter: "all"
  };

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const N2K_PHOTO_PREFIX = "N2KPHOTO/1|image/jpeg|";

  function isPhotoContent(value) {
    return String(value || "").startsWith(N2K_PHOTO_PREFIX);
  }

  function renderMessageContent(value) {
    const content = String(value || "");

    if (!isPhotoContent(content)) {
      return esc(content);
    }

    const b64 = content.slice(N2K_PHOTO_PREFIX.length);

    if (
      !b64 ||
      b64.length > 40000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)
    ) {
      return '<span class="n2k-photo-invalid">📷 Foto konnte nicht angezeigt werden</span>';
    }

    return '<img class="n2k-chat-photo" alt="Gesendetes Foto" loading="lazy" ' +
      'src="data:image/jpeg;base64,' + b64 + '">';
  }

  function cleanName(contact) {
    const peer =
      String(contact?.destination_hash || "");

    const raw =
      String(contact?.display_name || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();

    if (
      raw &&
      raw !== "Anonymous Peer" &&
      !raw.includes("\uFFFD")
    ) {
      return raw;
    }

    return peer
      ? "Kontakt " + peer.slice(0, 6).toUpperCase()
      : "Unbekannt";
  }

  function contactAge(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return "zuletzt: unbekannt";

    const age = Math.max(
      0,
      Math.floor(Date.now() / 1000) - value
    );

    if (age < 60) return "vor " + age + " s";
    if (age < 3600) return "vor " + Math.round(age / 60) + " min";
    if (age < 86400) return "vor " + Math.round(age / 3600) + " h";
    return "vor " + Math.round(age / 86400) + " d";
  }

  function contactMeta(contact, peer) {
    const parts = ["LXMF", contactAge(contact?.last_seen)];

    const source =
      String(
        contact?.discovery_source ||
        contact?.source ||
        ""
      ).trim();

    if (source === "known_destinations_cache") {
      parts.push("Cache");
    } else if (source === "announce" || source === "lxmf_announce") {
      parts.push("Announce");
    }

    if (peer) {
      parts.push(
        peer.slice(0, 8) + "…" + peer.slice(-4)
      );
    }

    return parts.join(" · ");
  }

  const CONTACT_PAGE_SIZE = 4;
  let visibleContactCount = CONTACT_PAGE_SIZE;

  function removeContactMoreButton() {
    document.getElementById("m97-contact-more")?.remove();
  }

  function renderContacts(resetLimit=false) {
    const root = $("msg-contact-list");
    if (!root) return;

    if (resetLimit) {
      visibleContactCount = CONTACT_PAGE_SIZE;
    }

    removeContactMoreButton();

    const favorites = readContactFavorites();
    const query = state.contactQuery.trim().toLocaleLowerCase("de");
    const contacts = state.contacts.filter(contact => {
      const peer = String(contact.destination_hash || "").toLowerCase();
      const saved = Boolean(contact.saved_contact || contact.manual_alias || contact.alias);
      const matchesGroup = state.contactFilter === "all" ||
        (state.contactFilter === "saved" && saved) ||
        (state.contactFilter === "favorites" && favorites.has(peer));
      return matchesGroup && (!query ||
        [cleanName(contact), contact.alias, contact.announced_name, peer]
          .some(value => String(value || "").toLocaleLowerCase("de").includes(query)));
    }).sort((a, b) => Number(favorites.has(String(b.destination_hash).toLowerCase())) -
      Number(favorites.has(String(a.destination_hash).toLowerCase())));

    const count = $("n2k-contact-count");
    if (count) count.textContent = contacts.length + " von " + state.contacts.length + " Kontakten";
    document.querySelectorAll("[data-n2k-contact-filter]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.n2kContactFilter === state.contactFilter));
    });
    if (!contacts.length) {
      root.innerHTML = '<div class="m97-empty">' +
        (query ? "Keine passenden Kontakte." : state.contactFilter === "favorites" ?
          "Noch keine Favoriten. Markiere einen Kontakt mit dem Stern." :
          state.contactFilter === "saved" ? "Noch keine gespeicherten Kontakte. Nutze + Kontakt oder benenne einen Kontakt im Chat." :
          "Keine Kontakte gefunden.") + '</div>';
      return;
    }

    const visibleContacts = contacts.slice(0, visibleContactCount);
    root.innerHTML = visibleContacts.map(contact => {
      const peer = String(contact.destination_hash || "").toLowerCase();
      const name = cleanName(contact);
      const favorite = favorites.has(peer);
      const saved = Boolean(contact.saved_contact || contact.manual_alias || contact.alias);
      return `<div class="n2k-contact-entry" data-n2k-contact-entry>
        <button type="button" class="messenger-contact m97-contact" data-m97-peer="${esc(peer)}">
          <span class="messenger-contact-avatar">${esc(name[0] || "?")}</span>
          <span class="messenger-contact-body">
            <span class="messenger-contact-name">${esc(name)}${saved ? ' <small class="n2k-contact-saved">Gespeichert</small>' : ""}</span>
            <span class="messenger-contact-preview">${esc(contactMeta(contact, peer))}</span>
          </span>
        </button>
        <button type="button" class="n2k-contact-star" data-n2k-favorite="${esc(peer)}"
          aria-pressed="${favorite}" aria-label="${favorite ? "Favorit entfernen" : "Als Favorit markieren"}: ${esc(name)}">${favorite ? "★" : "☆"}</button>
      </div>`;
    }).join("");
    root.querySelectorAll("[data-n2k-favorite]").forEach(button => {
      button.onclick = () => window.reticulumContacts104?.toggleFavorite(button.dataset.n2kFavorite);
    });

    root.querySelectorAll("[data-m97-peer]")
      .forEach(button => {
        button.onclick = () => {
          const peer =
            button.dataset.m97Peer;

          if (
            typeof window.openMessengerConversation
            === "function"
          ) {
            window.openMessengerConversation(peer);
          } else if (
            typeof window.openLXMFChat === "function"
          ) {
            window.openLXMFChat(peer);
          }
        };
      });

    const remaining =
      contacts.length - visibleContacts.length;

    if (remaining > 0) {
      const more =
        document.createElement("button");

      more.id = "m97-contact-more";
      more.type = "button";
      more.className = "m97-contact-more";
      more.textContent =
        "Weitere anzeigen (" + remaining + ")";

      more.style.cssText =
        "display:block;width:calc(100% - 24px);margin:10px 12px 14px;" +
        "min-height:44px;border:1px solid rgba(255,255,255,.12);" +
        "border-radius:12px;background:rgba(255,255,255,.035);" +
        "color:#cbd3d7;font:inherit;font-weight:650;cursor:pointer;";

      more.onclick = () => {
        visibleContactCount += CONTACT_PAGE_SIZE;
        renderContacts(false);

        if (
          typeof window.reticulumContacts104?.decorateContacts
          === "function"
        ) {
          window.reticulumContacts104.decorateContacts();
        }
      };

      root.insertAdjacentElement("afterend", more);
    }
  }

  function readContactFavorites() {
    try {
      const data = JSON.parse(localStorage.getItem("reticulum-messenger-favorites") || "[]");
      return new Set(Array.isArray(data) ? data.map(peer => String(peer).toLowerCase()) : []);
    } catch (_) { return new Set(); }
  }

  function bindContactControls() {
    const input = $("n2k-contact-search");
    if (input) input.addEventListener("input", () => {
      state.contactQuery = input.value;
      renderContacts(true);
    });
    document.querySelectorAll("[data-n2k-contact-filter]").forEach(button => {
      button.onclick = () => {
        state.contactFilter = button.dataset.n2kContactFilter;
        renderContacts(true);
      };
    });
    const announce = $("n2k-contact-announce");
    let cooldownUntil = 0;
    if (announce) announce.onclick = async () => {
      if (announce.disabled) return;
      const status = $("n2k-contact-announce-status");
      announce.disabled = true;
      status.textContent = "Announce wird angefordert…";
      try {
        const response = await fetch("api/node/lxmf/announce", {method: "POST", cache: "no-store"});
        const data = await response.json();
        if (!data.ok && !Number(data.retry_after)) throw new Error(data.error || "Announce fehlgeschlagen");
        status.textContent = data.ok ? "Announce angefordert. Deine LXMF-Adresse wird im Netz bekanntgegeben." : "Bitte bis zum nächsten Announce warten.";
        cooldownUntil = Date.now() + (data.ok ? 60 : Number(data.retry_after)) * 1000;
        const tick = () => {
          const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
          announce.textContent = seconds > 0 ? "Announce · " + seconds + " s" : "Announce senden";
          announce.disabled = seconds > 0;
          if (seconds > 0) setTimeout(tick, 1000);
        };
        tick();
      } catch (error) {
        status.textContent = "Announce fehlgeschlagen: " + error.message;
        announce.disabled = false;
      }
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindContactControls, {once: true});
  } else { bindContactControls(); }

  async function loadContacts() {
    try {
      const response =
        await fetch(
          "api/messenger/contacts?ts=" + Date.now(),
          {cache: "no-store"}
        );

      const data =
        await response.json();

      const rawContacts =
        Array.isArray(data?.contacts)
          ? data.contacts
          : [];

      const uniqueContacts =
        new Map();

      rawContacts.forEach(contact => {
        const peer =
          String(contact?.destination_hash || "")
            .trim()
            .toLowerCase();

        if (!peer) return;

        const previous =
          uniqueContacts.get(peer);

        if (
          !previous ||
          Number(contact?.last_seen || 0) >=
          Number(previous?.last_seen || 0)
        ) {
          uniqueContacts.set(peer, contact);
        }
      });

      state.contacts =
        [...uniqueContacts.values()];

      state.contacts.sort(
        (a, b) =>
          Number(b?.last_seen || 0) -
          Number(a?.last_seen || 0)
      );

      renderContacts(true);

    } catch (error) {
      console.error(
        "[Messenger 0.97] contacts",
        error
      );
    }
  }

  function selectTab(tab) {
    state.activeTab = tab;

    const app =
      document.getElementById("messenger-app");

    const conversation =
      document.querySelector(".messenger-conversation");

    if (app) {
      app.style.setProperty(
        "display",
        "block",
        "important"
      );
    }

    if (conversation) {
      conversation.style.setProperty(
        "display",
        "none",
        "important"
      );
    }

    document
      .querySelectorAll("[data-msg-tab]")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.msgTab === tab
        );
      });

    const contacts =
      $("msg-contacts-view");

    const settings =
      $("msg-settings-view");

    const mesh =
      $("msg-mesh-view");

    const chats =
      $("messenger-chat-list");

    if (contacts) {
      contacts.hidden = tab !== "contacts";
      contacts.style.setProperty(
        "display",
        tab === "contacts" ? "block" : "none",
        "important"
      );
    }

    if (settings) {
      settings.hidden = tab !== "settings";
      settings.style.setProperty(
        "display",
        tab === "settings" ? "block" : "none",
        "important"
      );
    }

    if (mesh) {
      mesh.hidden = tab !== "mesh";
      mesh.style.setProperty(
        "display",
        tab === "mesh" ? "block" : "none",
        "important"
      );
    }

    if (chats) {
      chats.hidden = tab !== "chats";
      chats.style.setProperty(
        "display",
        tab === "chats" ? "block" : "none",
        "important"
      );
    }

    if (tab === "contacts") {
      loadContacts();
    }
  }

  function init() {
    console.info(
      "[Reticulum Messenger] 0.97 external core"
    );

    document
      .querySelectorAll("[data-msg-tab]")
      .forEach(button => {
        button.onclick = () =>
          selectTab(button.dataset.msgTab);
      });

    selectTab("chats");
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once: true}
    );
  } else {
    init();
  }

  window.reticulumMessenger097 = {
    state,
    renderContacts,
    loadContacts,
    selectTab
  };
})();

/* =====================================================
   0.97 · EXTERNAL CHAT LIST
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let lastSignature = "";

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function chatName(chat) {
    const name =
      String(chat?.display_name || "").trim();

    if (
      name &&
      !/^Kontakt\s+[0-9A-F]+$/i.test(name)
    ) {
      return name;
    }

    const peer =
      String(chat?.peer_hash || "");

    return peer
      ? "Kontakt " + peer.slice(0,6).toUpperCase()
      : "Unbekannt";
  }

  function chatTime(ts) {
    ts = Number(ts || 0);
    if (!ts) return "";

    const d = new Date(ts * 1000);
    const now = new Date();

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(
        "de-DE",
        {hour:"2-digit", minute:"2-digit"}
      );
    }

    return d.toLocaleDateString(
      "de-DE",
      {day:"2-digit", month:"2-digit"}
    );
  }

  function renderChats(chats) {
    const root = $("messenger-chat-list");
    if (!root) return;

    if (!chats.length) {
      root.innerHTML = `
        <div class="m97-empty">
          <strong>Noch keine Chats</strong>
          <span>Gespeicherte Kontakte öffnen oder eine LXMF-Nachricht senden, um ein Gespräch zu starten.</span>
          <button type="button" data-n2k-empty-contacts>Kontakte öffnen</button>
        </div>
      `;
      root.querySelector("[data-n2k-empty-contacts]")?.addEventListener("click",function(){
        if(typeof window.n2kShowPage==="function") window.n2kShowPage("contacts");
      });
      return;
    }

    root.innerHTML = chats.map(chat => {
      const peer =
        String(chat.peer_hash || "");

      const name =
        chatName(chat);

      const rawPreview =
        String(chat.last_message || "Noch keine Nachrichten");

      const preview =
        rawPreview.startsWith("N2KPHOTO/1|image/jpeg|")
          ? "📷 Foto"
          : rawPreview;

      const unread =
        Number(chat.unread || 0);

      return `
        <button
          type="button"
          class="messenger-contact"
          data-m97-chat="${esc(peer)}"
        >
          <span class="messenger-contact-avatar">
            ${esc(name[0] || "?")}
          </span>

          <span class="messenger-contact-body">
            <span class="messenger-contact-name">
              ${esc(name)}
            </span>

            <span class="messenger-contact-preview">
              ${esc(preview)}
            </span>
          </span>

          <span class="messenger-contact-time">
            ${esc(chatTime(chat.last_timestamp))}
            ${
              unread > 0
                ? `<span class="m80-unread">${unread}</span>`
                : ""
            }
          </span>
        </button>
      `;
    }).join("");

    root
      .querySelectorAll("[data-m97-chat]")
      .forEach(button => {
        button.onclick = () => {
          const peer =
            button.dataset.m97Chat;

          if (
            typeof window.openMessengerConversation
            === "function"
          ) {
            window.openMessengerConversation(peer);
          }
        };
      });
  }

  function showChatLoadError(root){
    if(!root || root.querySelector("[data-m97-chat]")) return;
    root.innerHTML=`
      <div class="m97-empty">
        <strong>Chatliste gerade nicht erreichbar</strong>
        <span>Die Gespräche konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut.</span>
        <button type="button" data-n2k-chat-retry>Erneut laden</button>
      </div>
    `;
    root.querySelector("[data-n2k-chat-retry]")?.addEventListener("click",function(){refreshChats();});
  }

  async function refreshChats() {
    try {
      const response =
        await fetch(
          "api/messenger?ts=" + Date.now(),
          {cache:"no-store"}
        );

      if (!response.ok) {
        showChatLoadError($("messenger-chat-list"));
        return;
      }

      const data =
        await response.json();

      const chats =
        Array.isArray(data?.conversations)
          ? data.conversations
          : [];

      const signature =
        JSON.stringify(
          chats.map(c => [
            c.peer_hash,
            c.last_timestamp,
            c.last_message,
            c.unread
          ])
        );

      const listRoot=$("messenger-chat-list");
      const expectedPeers=chats.map(chat=>String(chat.peer_hash||""));
      const renderedPeers=listRoot
        ? Array.from(listRoot.querySelectorAll("[data-m97-chat]"),row=>String(row.dataset.m97Chat||""))
        : [];
      const listNeedsRepair=!listRoot ||
        JSON.stringify(renderedPeers)!==JSON.stringify(expectedPeers) ||
        (chats.length===0 && !listRoot.querySelector(".m97-empty"));

      /* A page/router repair can empty the DOM without changing the message
         data. Re-render in that case instead of trusting the data signature. */
      if (signature === lastSignature && !listNeedsRepair) {
        return;
      }

      lastSignature = signature;
      renderChats(chats);

    } catch (error) {
      showChatLoadError($("messenger-chat-list"));
      console.error(
        "[Messenger 0.97] chats",
        error
      );
    }
  }

  refreshChats();

  setInterval(
    refreshChats,
    10000
  );

  window.reticulumMessengerChats097 = {
    refresh: refreshChats
  };
})();

/* =====================================================
   0.97 · EXTERNAL OPEN CHAT
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let activePeer = "";
  let lastConversationSignature = "";

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderMessageContent(value) {
    const prefix = "N2KPHOTO/1|image/jpeg|";
    const content = String(value || "");

    if (!content.startsWith(prefix)) {
      return esc(content);
    }

    const b64 = content.slice(prefix.length);

    if (
      !b64 ||
      b64.length > 40000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)
    ) {
      return '<span class="n2k-photo-invalid">📷 Foto konnte nicht angezeigt werden</span>';
    }

    return '<img class="n2k-chat-photo" alt="Gesendetes Foto" loading="lazy" ' +
      'src="data:image/jpeg;base64,' + b64 + '">';
  }

  function shortTime(ts) {
    ts = Number(ts || 0);
    if (!ts) return "";

    return new Date(ts * 1000)
      .toLocaleTimeString(
        "de-DE",
        {hour:"2-digit", minute:"2-digit"}
      );
  }

  async function renderConversation(scrollBottom=true) {
    const box = $("lxmf-inbox");
    if (!box || !activePeer) return;

    try {
      const response =
        await fetch(
          "api/messenger?ts=" + Date.now(),
          {cache:"no-store"}
        );

      if (!response.ok) return;

      const data = await response.json();

      const chats =
        Array.isArray(data?.conversations)
          ? data.conversations
          : [];

      const chat =
        chats.find(
          c => String(c.peer_hash || "") === activePeer
        );

      const messages =
        Array.isArray(chat?.messages)
          ? chat.messages
          : [];

      const signature =
        JSON.stringify(
          messages.map(message => [
            message.message_id || "",
            message.timestamp || 0,
            message.direction || "",
            message.delivery_status || "",
            message.delivery_method || "",
            message.delivery_updated_at || 0,
            message.content || ""
          ])
        );

      if (
        signature === lastConversationSignature &&
        box.childElementCount > 0
      ) {
        return;
      }

      lastConversationSignature = signature;

      if (!messages.length) {
        box.innerHTML =
          '<div class="m97-empty">' +
          'Noch keine Nachrichten mit diesem Kontakt.' +
          '</div>';
        return;
      }

      box.innerHTML =
        messages.map(message => {
          const mine =
            message.direction === "out";

          return `
            <div class="lxmf-message-row ${
              mine ? "mine" : "theirs"
            }">
              <div class="lxmf-bubble">
                <div class="lxmf-bubble-content">
                  ${renderMessageContent(message.content || "")}
                </div>
                <div class="lxmf-bubble-meta">
                  ${esc(shortTime(message.timestamp))}
                  ${
                    mine
                      ? ` · <span class="m105-delivery ${
                          message.delivery_status === "delivered"
                            ? "m105-delivered"
                            : message.delivery_status === "failed"
                              ? "m105-failed"
                              : "m105-queued"
                        }">${
                          message.delivery_status === "delivered"
                            ? "zugestellt ✓✓"
                            : message.delivery_status === "propagated"
                              ? "am Propagation Node ✓"
                              : message.delivery_status === "failed"
                                ? "fehlgeschlagen ⚠"
                                : message.delivery_method === "propagated"
                                  ? "Store & Forward ⏳"
                                  : "in Übertragung …"
                        }</span>`
                      : ""
                  }
                </div>
              </div>
            </div>
          `;
        }).join("");

      if (scrollBottom) {
        box.scrollTop = box.scrollHeight;
      }

    } catch (error) {
      console.error(
        "[Messenger 0.97] conversation",
        error
      );
    }
  }

  window.openMessengerConversation =
    function(peer) {
      const nextPeer =
        String(peer || "").trim();

      if (!nextPeer) return;

      if (nextPeer !== activePeer) {
        lastConversationSignature = "";
      }

      activePeer = nextPeer;

      const hidden =
        $("lxmf-chat-destination");

      if (hidden) {
        hidden.value = activePeer;
      }

      if (
        typeof window.messengerShowConversation
        === "function"
      ) {
        window.messengerShowConversation();
      }

      renderConversation(true);
    };

  window.reticulumConversation097 = {
    render: renderConversation,
    get activePeer() {
      return activePeer;
    }
  };
})();

/* =====================================================
   0.97 · EXTERNAL SEND
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  async function sendMessage() {
    const input =
      $("lxmf-chat-content");

    const destination =
      $("lxmf-chat-destination");

    const button =
      $("lxmf-chat-send");

    const status =
      $("lxmf-chat-status");

    const peer =
      String(destination?.value || "").trim();

    const content =
      String(input?.value || "").trim();

    if (!peer) {
      if (status) {
        status.textContent =
          "Kein Kontakt ausgewählt.";
      }
      return;
    }

    if (!content) {
      return;
    }

    if (button) {
      button.disabled = true;
    }

    if (status) {
      status.textContent =
        "Wird gesendet…";
    }

    try {
      const response =
        await fetch(
          "api/node/lxmf/send",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              destination_hash: peer,
              content,
              title: "Home Assistant"
            }),
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Versand fehlgeschlagen"
        );
      }

      if (input) {
        input.value = "";
      }

      if (status) {
        status.textContent =
          "Nachricht ausgehend";
      }

      setTimeout(() => {
        window.reticulumConversation097
          ?.render(true);
      }, 300);

      setTimeout(() => {
        window.reticulumConversation097
          ?.render(true);

        window.reticulumMessengerChats097
          ?.refresh();
      }, 1500);

    } catch (error) {
      console.error(
        "[Messenger 0.97] send",
        error
      );

      if (status) {
        status.textContent =
          "Versand fehlgeschlagen";
      }

    } finally {
      if (button) {
        button.disabled = false;
      }

      setTimeout(() => {
        if (status) {
          status.textContent = "";
        }
      }, 4000);
    }
  }

  function init() {
    const button =
      $("lxmf-chat-send");

    const input =
      $("lxmf-chat-content");

    if (button) {
      button.onclick =
        sendMessage;
    }

    if (input) {
      input.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter" &&
            !event.shiftKey
          ) {
            event.preventDefault();
            sendMessage();
          }
        }
      );
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumSend097 = {
    send: sendMessage
  };
})();

/* =====================================================
   0.97.3 · MOBILE NAVIGATION
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function isMobile() {
    return window.matchMedia(
      "(max-width: 700px)"
    ).matches;
  }

  function showList() {
    if (!isMobile()) return;

    const list = $("messenger-app");

    const chat =
      document.querySelector(
        ".messenger-conversation"
      );

    if (list) {
      list.style.setProperty(
        "display",
        "block",
        "important"
      );

      list.classList.remove(
        "m97-chat-open"
      );
    }

    if (chat) {
      chat.style.setProperty(
        "display",
        "none",
        "important"
      );
    }
  }

  function showConversation() {
    if (!isMobile()) return;

    const list = $("messenger-app");

    const chat =
      document.querySelector(
        ".messenger-conversation"
      );

    if (list) {
      list.style.setProperty(
        "display",
        "block",
        "important"
      );

      list.classList.add(
        "m97-chat-open"
      );
    }

    if (chat) {
      chat.style.setProperty(
        "display",
        "flex",
        "important"
      );
    }
  }

  const oldOpen =
    window.openMessengerConversation;

  if (
    typeof oldOpen === "function"
  ) {
    window.openMessengerConversation =
      function(peer) {
        oldOpen(peer);
        showConversation();
      };
  }

  function init() {
    const back =
      $("messenger-back");

    if (back) {
      back.onclick = event => {
        event.preventDefault();
        showList();
      };
    }

    if (isMobile()) {
      showList();
    }

    window.addEventListener(
      "popstate",
      () => {
        if (isMobile()) {
          showList();
        }
      }
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumMobile097 = {
    showList,
    showConversation,
    isMobile
  };
})();

/* =====================================================
   0.97.4 · RETURN TO SOURCE TAB
   ===================================================== */

(() => {
  "use strict";

  let sourceTab = "chats";

  function rememberSourceTab() {
    const active =
      document.querySelector(
        "[data-msg-tab].active"
      );

    sourceTab =
      active?.dataset?.msgTab || "chats";
  }

  const oldOpen =
    window.openMessengerConversation;

  if (
    typeof oldOpen === "function"
  ) {
    window.openMessengerConversation =
      function(peer) {
        rememberSourceTab();
        oldOpen(peer);
      };
  }

  const oldShowList =
    window.reticulumMobile097?.showList;

  function restoreSourceTab() {
    if (
      window.reticulumMessenger097 &&
      typeof window.reticulumMessenger097.selectTab
        === "function"
    ) {
      window.reticulumMessenger097.selectTab(
        sourceTab
      );
    }
  }

  if (
    window.reticulumMobile097 &&
    typeof oldShowList === "function"
  ) {
    window.reticulumMobile097.showList =
      function() {
        oldShowList();
        restoreSourceTab();
      };
  }

  const back =
    document.getElementById(
      "messenger-back"
    );

  if (back) {
    back.onclick = event => {
      event.preventDefault();

      if (
        window.reticulumMobile097?.showList
      ) {
        window.reticulumMobile097.showList();
      }

      restoreSourceTab();
    };
  }

  window.reticulumReturn0974 = {
    get sourceTab() {
      return sourceTab;
    }
  };
})();

/* =====================================================
   1.19.0 · MESH PHOTO
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const PREFIX = "N2KPHOTO/1|image/jpeg|";
  const MAX_DIMENSION = 320;
  const TARGET_BYTES = 18 * 1024;
  let pendingPayload = "";
  let pendingBytes = 0;
  let pendingPeer = "";

  function dataUrlBytes(dataUrl) {
    const comma = String(dataUrl || "").indexOf(",");
    if (comma < 0) return 0;
    const b64 = dataUrl.slice(comma + 1);
    return Math.floor((b64.length * 3) / 4);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Bild konnte nicht gelesen werden"));
      };
      img.src = url;
    });
  }

  async function compressPhoto(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Bitte ein Bild auswählen");
    }

    const img = await loadImage(file);
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));

    let width = Math.max(1, Math.round(sourceWidth * ratio));
    let height = Math.max(1, Math.round(sourceHeight * ratio));
    let quality = 0.72;
    let dataUrl = "";

    for (let attempt = 0; attempt < 10; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", {alpha:false});
      if (!ctx) throw new Error("Bildkomprimierung nicht verfügbar");

      ctx.drawImage(img, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);

      const bytes = dataUrlBytes(dataUrl);
      if (bytes <= TARGET_BYTES) {
        return {
          payload: PREFIX + dataUrl.split(",", 2)[1],
          dataUrl,
          bytes,
          width,
          height
        };
      }

      if (quality > 0.36) {
        quality -= 0.08;
      } else {
        width = Math.max(120, Math.round(width * 0.84));
        height = Math.max(120, Math.round(height * 0.84));
        quality = 0.48;
      }
    }

    const bytes = dataUrlBytes(dataUrl);
    if (bytes > 24 * 1024) {
      throw new Error("Foto bleibt nach Komprimierung zu groß");
    }

    return {
      payload: PREFIX + dataUrl.split(",", 2)[1],
      dataUrl,
      bytes,
      width,
      height
    };
  }

  function clearPending() {
    pendingPayload = "";
    pendingBytes = 0;
    pendingPeer = "";

    const input = $("n2k-photo-input");
    const preview = $("n2k-photo-preview");
    const img = $("n2k-photo-preview-image");
    const meta = $("n2k-photo-preview-meta");

    if (input) input.value = "";
    if (img) img.removeAttribute("src");
    if (meta) meta.textContent = "";
    if (preview) preview.hidden = true;
  }

  async function choosePhoto(file) {
    const status = $("lxmf-chat-status");
    const preview = $("n2k-photo-preview");
    const img = $("n2k-photo-preview-image");
    const meta = $("n2k-photo-preview-meta");

    try {
      if (status) status.textContent = "Foto wird für Mesh komprimiert…";
      const result = await compressPhoto(file);
      pendingPayload = result.payload;
      pendingBytes = result.bytes;
      pendingPeer = String($("lxmf-chat-destination")?.value || "").trim();

      if (img) img.src = result.dataUrl;
      if (meta) {
        meta.textContent =
          result.width + "×" + result.height + " · " +
          Math.max(1, Math.round(result.bytes / 1024)) + " KB";
      }
      if (preview) preview.hidden = false;
      if (status) status.textContent = "Mesh-Foto bereit";
    } catch (error) {
      clearPending();
      if (status) status.textContent = "Foto: " + error.message;
    }
  }

  async function sendPhoto() {
    const peer = String($("lxmf-chat-destination")?.value || "").trim();
    const status = $("lxmf-chat-status");
    const send = $("n2k-photo-send");

    if (!peer) {
      if (status) status.textContent = "Kein Kontakt ausgewählt.";
      return;
    }

    if (!pendingPayload) return;

    if (pendingPeer && pendingPeer !== peer) {
      clearPending();
      if (status) status.textContent = "Foto verworfen: Kontakt wurde gewechselt.";
      return;
    }

    if (send) send.disabled = true;
    if (status) {
      status.textContent =
        "Mesh-Foto (" + Math.max(1, Math.round(pendingBytes/1024)) +
        " KB) wird über LXMF gesendet…";
    }

    try {
      const response = await fetch("api/node/lxmf/send", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          destination_hash:peer,
          content:pendingPayload,
          title:"N2K Mesh Photo"
        }),
        cache:"no-store"
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "Versand fehlgeschlagen");
      }

      clearPending();
      if (status) status.textContent = "Foto ausgehend";

      setTimeout(() => window.reticulumConversation097?.render(true), 300);
      setTimeout(() => {
        window.reticulumConversation097?.render(true);
        window.reticulumMessengerChats097?.refresh();
      }, 1500);

    } catch (error) {
      if (status) status.textContent = "Foto-Versand fehlgeschlagen: " + error.message;
    } finally {
      if (send) send.disabled = false;
    }
  }

  function init() {
    const input = $("n2k-photo-input");
    const pick = $("n2k-photo-pick");
    const cancel = $("n2k-photo-cancel");
    const send = $("n2k-photo-send");

    if (pick) pick.addEventListener("click", () => input?.click());

    if (input) {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) choosePhoto(file);
      });
    }

    if (cancel) cancel.addEventListener("click", clearPending);
    if (send) send.addEventListener("click", sendPhoto);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();

/* =====================================================
   0.98.0 · BETA UX CORE
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let contactNames = new Map();
  let refreshTimer = null;

  function clean(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
  }

  async function loadContactNames() {
    try {
      const response = await fetch(
        "api/messenger/contacts?ts=" + Date.now(),
        {cache:"no-store"}
      );

      if (!response.ok) return;

      const data = await response.json();

      const contacts =
        Array.isArray(data?.contacts)
          ? data.contacts
          : [];

      contactNames = new Map();

      contacts.forEach(contact => {
        const peer =
          String(contact.destination_hash || "");

        let name =
          clean(contact.display_name);

        if (
          !name ||
          name === "Anonymous Peer" ||
          name.includes("\uFFFD")
        ) {
          name =
            "Kontakt " +
            peer.slice(0,6).toUpperCase();
        }

        contactNames.set(peer, name);
      });

    } catch (_) {}
  }

  function applyChatHeader(peer) {
    peer = String(peer || "").trim();

    if (!peer) return;

    const name =
      contactNames.get(peer) ||
      "Kontakt " +
      peer.slice(0,6).toUpperCase();

    const title =
      $("lxmf-chat-name");

    const sub =
      $("lxmf-chat-peer");

    const avatar =
      $("lxmf-chat-avatar");

    if (title) {
      title.textContent = name;
    }

    if (sub) {
      sub.textContent =
        "Reticulum · LXMF";
      sub.title = peer;
    }

    if (avatar) {
      avatar.textContent =
        (name[0] || "?").toUpperCase();
    }
  }

  function installSearch() {
    const app =
      $("messenger-app");

    const tabs =
      app?.querySelector(".msg-tabs");

    if (!app || !tabs) return;

    if ($("m98-search")) return;

    const wrap =
      document.createElement("div");

    wrap.id = "m98-search-wrap";

    wrap.innerHTML = `
      <input
        id="m98-search"
        type="search"
        autocomplete="off"
        placeholder="Chats und Kontakte durchsuchen…"
      >
    `;

    tabs.insertAdjacentElement(
      "afterend",
      wrap
    );

    const input =
      $("m98-search");

    input.addEventListener(
      "input",
      () => {
        const query =
          input.value
            .trim()
            .toLowerCase();

        document
          .querySelectorAll(
            "#messenger-chat-list .messenger-contact," +
            "#msg-contact-list .messenger-contact"
          )
          .forEach(item => {
            const text =
              item.textContent
                .toLowerCase();

            item.style.display =
              !query ||
              text.includes(query)
                ? ""
                : "none";
          });
      }
    );
  }

  function installTabMemory() {
    document
      .querySelectorAll("[data-msg-tab]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            localStorage.setItem(
              "reticulum-messenger-tab",
              button.dataset.msgTab
            );

            const search =
              $("m98-search");

            if (search) {
              search.value = "";
              search.dispatchEvent(
                new Event("input")
              );
            }
          }
        );
      });

    const saved =
      localStorage.getItem(
        "reticulum-messenger-tab"
      );

    if (
      saved &&
      window.reticulumMessenger097
        ?.selectTab
    ) {
      window.reticulumMessenger097
        .selectTab(saved);
    }
  }

  function installComposer() {
    const input =
      $("lxmf-chat-content");

    if (!input) return;

    function resize() {
      input.style.height = "auto";

      input.style.height =
        Math.min(
          input.scrollHeight,
          140
        ) + "px";
    }

    input.addEventListener(
      "input",
      resize
    );

    resize();
  }

  function installOpenHook() {
    const oldOpen =
      window.openMessengerConversation;

    if (
      typeof oldOpen !== "function"
    ) return;

    window.openMessengerConversation =
      function(peer) {

        oldOpen(peer);

        applyChatHeader(peer);

        loadContactNames().then(() => {
          applyChatHeader(peer);
        });
      };
  }

  function startLiveRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer =
      setInterval(() => {

        const peer =
          window.reticulumConversation097
            ?.activePeer;

        if (!peer) return;

        window.reticulumConversation097
          ?.render(false);

      }, 5000);
  }

  async function init() {
    await loadContactNames();

    installSearch();
    installTabMemory();
    installComposer();
    installOpenHook();
    startLiveRefresh();

    console.info(
      "[Reticulum Messenger] 0.98 Beta UX ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumBeta098 = {
    loadContactNames,
    applyChatHeader
  };
})();

/* =====================================================
   0.99.0 · PROFILE / IDENTITY / ANNOUNCE
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const ANNOUNCE_COOLDOWN_SECONDS = 60;
  let announceCooldownTimer = null;

  function shortHash(value) {
    const v = String(value || "");
    if (!v) return "—";
    if (v.length <= 20) return v;
    return v.slice(0,10) + "…" + v.slice(-8);
  }

  async function loadIdentity() {
    const root = $("n2k-page-settings") || $("msg-settings-view");

    if (!root) return;

    let panel = $("m99-profile-panel");
    if (panel && (panel.dataset.saving === "1" || panel.contains(document.activeElement))) return;

    if (!panel) {
      panel =
        document.createElement("div");

      panel.id =
        "m99-profile-panel";

      panel.className =
        "m99-profile-panel";

      root.appendChild(panel);
    }
    // The unified router hides the legacy settings container. Keep the
    // existing profile form on the actual Settings page after reparenting.
    if (panel.parentElement !== root) root.appendChild(panel);
    panel.hidden = false;

    panel.innerHTML = `
      <div class="m99-loading">
        Messenger-Profil wird geladen…
      </div>
    `;

    try {
      const response =
        await fetch(
          "api/node/identity?ts=" +
          Date.now(),
          {cache:"no-store"}
        );

      const data =
        await response.json();

      const name =
        String(
          data?.lxmf_display_name ||
          "Home Assistant"
        );

      const identity =
        String(
          data?.identity_hash || ""
        );

      const destination =
        String(
          data?.lxmf_destination_hash || ""
        );

      const lastAnnounce =
        Number(
          data?.lxmf_last_announce || 0
        );

      const nowSeconds =
        Math.floor(Date.now() / 1000);

      const announceRetryAfter =
        lastAnnounce
          ? Math.max(
              0,
              ANNOUNCE_COOLDOWN_SECONDS -
              (nowSeconds - lastAnnounce)
            )
          : 0;

      let announceText =
        "Noch kein LXMF-Announce";

      if (lastAnnounce) {
        announceText =
          new Date(
            lastAnnounce * 1000
          ).toLocaleString("de-DE");
      }

      panel.innerHTML = `
        <div class="m99-card">

          <div class="m99-title">
            Mein Name im Reticulum-Netz
          </div>

          <label class="m99-label" for="m99-name">
            Eigener Anzeigename
          </label>

          <div class="m99-name-row">
            <input
              id="m99-name"
              type="text"
              maxlength="40"
              value="${escapeHtml(name)}"
            >

            <button
              id="m99-save"
              type="button"
            >
              Speichern
            </button>
          </div>

          <div
            id="m99-save-status"
            class="m99-status"
          ></div>

          <div class="m99-separator"></div>

          <div class="m99-meta">
            <span>Identity</span>
            <strong title="${escapeHtml(identity)}">
              ${escapeHtml(shortHash(identity))}
            </strong>
          </div>

          <div class="m99-meta">
            <span>LXMF Destination</span>
            <strong title="${escapeHtml(destination)}">
              ${escapeHtml(shortHash(destination))}
            </strong>
          </div>

          <div class="m99-meta">
            <span>Letzter Announce</span>
            <strong>
              ${escapeHtml(announceText)}
            </strong>
          </div>

          <button
            id="m99-announce"
            type="button"
            class="m99-announce"
            ${announceRetryAfter > 0 ? "disabled" : ""}
          >
            Jetzt announcen
          </button>

          <div
            id="m99-announce-status"
            class="m99-status"
          ></div>

        </div>
      `;

      bindProfileActions();

      if (announceRetryAfter > 0) {
        startAnnounceCooldown(
          announceRetryAfter
        );
      }

    } catch (error) {
      panel.innerHTML = `
        <div class="m99-error">
          Profil derzeit nicht verfügbar.
        </div>
      `;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bindProfileActions() {
    const save =
      $("m99-save");

    const announce =
      $("m99-announce");

    if (save) {
      save.onclick =
        saveProfile;
    }

    if (announce) {
      announce.onclick =
        sendAnnounce;
    }
  }

  async function saveProfile() {
    const input =
      $("m99-name");

    const status =
      $("m99-save-status");

    const name =
      String(
        input?.value || ""
      ).trim();

    if (!name) {
      if (status) {
        status.textContent =
          "Name darf nicht leer sein.";
      }
      return;
    }

    if (status) {
      status.textContent =
        "Wird gespeichert…";
    }

    const button = $("m99-save");
    const panel = $("m99-profile-panel");
    if (button?.disabled) return;
    if (button) button.disabled = true;
    if (panel) panel.dataset.saving = "1";
    try {
      const response =
        await fetch(
          "api/messenger/profile",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              name
            }),
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Speichern fehlgeschlagen"
        );
      }

      if (status) {
        status.textContent = data.restart_required
          ? "Name gespeichert. Add-on neu starten, damit er aktiv wird."
          : "Name gespeichert. Wird im laufenden Node übernommen…";
      }
      if (!data.restart_required) {
        setTimeout(async () => {
          try {
            const response = await fetch("api/node/identity?ts=" + Date.now(), {cache: "no-store"});
            const identity = await response.json();
            if (status && identity.lxmf_display_name === name) {
              status.textContent = "Name gespeichert und aktiv. Announce wird automatisch gesendet.";
            } else if (status && identity.lxmf_profile_error) {
              status.textContent = "Name gespeichert. Übernahme fehlgeschlagen: " + identity.lxmf_profile_error;
            }
            window.reticulumNodeHeader?.refresh();
          } catch (_) { /* Keep the confirmed save feedback. */ }
        }, 3500);
      }

    } catch (error) {
      if (status) {
        status.textContent =
          "Speichern fehlgeschlagen: " +
          error.message;
      }
    } finally {
      if (button) button.disabled = false;
      if (panel) panel.dataset.saving = "0";
    }
  }

  function formatCooldown(seconds) {
    const safeSeconds =
      Math.max(
        0,
        Math.ceil(Number(seconds) || 0)
      );

    const minutes =
      Math.floor(safeSeconds / 60);

    const rest =
      String(safeSeconds % 60)
        .padStart(2, "0");

    return minutes + ":" + rest;
  }

  function startAnnounceCooldown(seconds) {
    let remaining =
      Math.max(
        0,
        Math.ceil(Number(seconds) || 0)
      );

    if (announceCooldownTimer) {
      clearInterval(
        announceCooldownTimer
      );

      announceCooldownTimer = null;
    }

    const render = () => {
      const currentButton =
        $("m99-announce");

      const currentStatus =
        $("m99-announce-status");

      if (!currentButton) {
        if (announceCooldownTimer) {
          clearInterval(
            announceCooldownTimer
          );

          announceCooldownTimer = null;
        }

        return;
      }

      if (remaining <= 0) {
        currentButton.disabled = false;
        currentButton.textContent =
          "Jetzt announcen";

        if (
          currentStatus &&
          currentStatus.textContent.startsWith(
            "Nächster Announce in "
          )
        ) {
          currentStatus.textContent =
            "Announce wieder möglich.";
        }

        if (announceCooldownTimer) {
          clearInterval(
            announceCooldownTimer
          );

          announceCooldownTimer = null;
        }

        return;
      }

      currentButton.disabled = true;
      currentButton.textContent =
        "Cooldown " +
        formatCooldown(remaining);

      if (currentStatus) {
        currentStatus.textContent =
          "Nächster Announce in " +
          formatCooldown(remaining) +
          " min";
      }
    };

    render();

    if (remaining <= 0) {
      return;
    }

    announceCooldownTimer =
      setInterval(() => {
        remaining -= 1;
        render();
      }, 1000);
  }

  async function sendAnnounce() {
    const status =
      $("m99-announce-status");

    const button =
      $("m99-announce");

    if (button?.disabled) {
      return;
    }

    if (button) {
      button.disabled = true;
    }

    if (status) {
      status.textContent =
        "Announce wird angefordert…";
    }

    try {
      const response =
        await fetch(
          "api/node/lxmf/announce",
          {
            method: "POST",
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (
        !data?.ok &&
        Number(data?.retry_after) > 0
      ) {
        startAnnounceCooldown(
          Number(data.retry_after)
        );

        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Announce fehlgeschlagen"
        );
      }

      if (status) {
        status.textContent =
          "Announce angefordert.";
      }

      startAnnounceCooldown(
        ANNOUNCE_COOLDOWN_SECONDS
      );

      setTimeout(
        loadIdentity,
        1500
      );

    } catch (error) {
      if (button) {
        button.disabled = false;
      }

      if (status) {
        status.textContent =
          "Announce fehlgeschlagen: " +
          error.message;
      }
    }
  }

  function hookSettingsTab() {
    document
      .querySelectorAll(
        '[data-msg-tab="settings"]'
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            setTimeout(
              loadIdentity,
              50
            );
          }
        );
      });
  }

  function init() {
    hookSettingsTab();
  }

  // Public hook for the custom mobile navigation.
  // The mobile Status tab does not click the legacy settings tab,
  // so it must be able to load the profile/announce panel directly.
  window.reticulumProfile099 = {
    loadIdentity,
    sendAnnounce
  };

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumProfile099 = {
    loadIdentity,
    saveProfile,
    sendAnnounce
  };
})();

/* =====================================================
   1.00.0-beta2 · VISIBLE VERSION
   ===================================================== */

(() => {
  "use strict";

  function showVersion() {
    const brand =
      document.getElementById(
        "n2k-messenger-brand"
      );

    if (!brand) return;

    if (
      document.getElementById(
        "n2k-messenger-version"
      )
    ) return;

    const version =
      document.createElement("div");

    version.id =
      "n2k-messenger-version";

    version.textContent =
      "Reticulum Messenger · 1.00 Beta 2";

    brand.appendChild(version);
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(showVersion, 50),
      {once:true}
    );
  } else {
    setTimeout(showVersion, 50);
  }
})();

/* =====================================================
   1.00.0-beta3 · GLOBAL BRAND HEADER
   ===================================================== */

(() => {
  "use strict";

  function initGlobalBrand() {
    if (document.getElementById("n2k-global-brand")) {
      return;
    }

    const main =
      document.querySelector("main") ||
      document.body;

    if (!main) return;

    const brand =
      document.createElement("div");

    brand.id = "n2k-global-brand";

    brand.innerHTML = `
      <div class="n2k-global-title">
        Netfreak2k
      </div>

      <div class="n2k-global-sub">
        Offgrid Mesh Local Intelligence
      </div>

      <div class="n2k-global-version">
        Reticulum · 1.00 Beta 3
      </div>
    `;

    main.prepend(brand);
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initGlobalBrand,
      {once:true}
    );
  } else {
    initGlobalBrand();
  }
})();

/* =====================================================
   1.01.0-dev · LIVE STATUS / OFFLINE / UNREAD
   ===================================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    online: false,
    lastOk: 0,
    unread: 0,
    timer: null
  };

  function ensureStatusBar() {
    if ($("m101-live")) return;

    const brand =
      $("n2k-global-brand") ||
      $("messenger-app");

    if (!brand) return;

    const bar =
      document.createElement("div");

    bar.id = "m101-live";

    bar.innerHTML = `
      <span
        id="m101-dot"
        class="m101-dot"
      ></span>

      <span id="m101-state">
        Verbindung wird geprüft…
      </span>

      <span
        id="m101-time"
        class="m101-time"
      ></span>
    `;

    brand.appendChild(bar);
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";

    return new Date(timestamp)
      .toLocaleTimeString(
        "de-DE",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      );
  }

  function renderStatus() {
    ensureStatusBar();

    const dot = $("m101-dot");
    const label = $("m101-state");
    const time = $("m101-time");

    if (!dot || !label || !time) return;

    dot.classList.toggle(
      "online",
      state.online
    );

    dot.classList.toggle(
      "offline",
      !state.online
    );

    if (state.online) {
      label.textContent =
        "Reticulum online";

      time.textContent =
        "Aktualisiert " +
        formatTime(state.lastOk);
    } else {
      label.textContent =
        "Verbindung unterbrochen";

      time.textContent =
        state.lastOk
          ? "Letzter Kontakt " +
            formatTime(state.lastOk)
          : "";
    }
  }

  async function checkStatus() {
    try {
      const response =
        await fetch(
          "api/status?ts=" + Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          "HTTP " + response.status
        );
      }

      const data =
        await response.json();

      state.online =
        data?.online !== false &&
        data?.status !== "offline";

      state.lastOk =
        Date.now();

    } catch (_) {
      state.online = false;
    }

    renderStatus();
  }

  function updateUnreadUI(total) {
    total =
      Math.max(
        0,
        Number(total || 0)
      );

    state.unread = total;

    const chatTab =
      document.querySelector(
        '[data-msg-tab="chats"]'
      );

    if (chatTab) {
      const label =
        chatTab.querySelector(
          ".m101-chat-label"
        );

      if (label) {
        label.textContent =
          total > 0
            ? `Chats (${total})`
            : "Chats";
      } else {
        const spans =
          chatTab.querySelectorAll("span");

        const text =
          spans[spans.length - 1];

        if (text) {
          text.classList.add(
            "m101-chat-label"
          );

          text.textContent =
            total > 0
              ? `Chats (${total})`
              : "Chats";
        }
      }
    }

    document.title =
      total > 0
        ? `(${total}) Reticulum`
        : "Reticulum";
  }

  async function refreshUnread() {
    try {
      const response =
        await fetch(
          "api/messenger?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const chats =
        Array.isArray(
          data?.conversations
        )
          ? data.conversations
          : [];

      const total =
        chats.reduce(
          (sum, chat) =>
            sum +
            Math.max(
              0,
              Number(
                chat?.unread || 0
              )
            ),
          0
        );

      updateUnreadUI(total);

    } catch (_) {
      /* Statusprüfung kümmert sich
         um Offline-Anzeige. */
    }
  }

  function refreshAll() {
    checkStatus();
    refreshUnread();

    if (
      window
        .reticulumMessengerChats097
        ?.refresh
    ) {
      window
        .reticulumMessengerChats097
        .refresh();
    }

    const peer =
      window
        .reticulumConversation097
        ?.activePeer;

    if (peer) {
      window
        .reticulumConversation097
        ?.render(false);
    }
  }

  function init() {
    ensureStatusBar();

    refreshAll();

    if (state.timer) {
      clearInterval(state.timer);
    }

    state.timer =
      setInterval(
        refreshAll,
        10000
      );

    window.addEventListener(
      "online",
      refreshAll
    );

    window.addEventListener(
      "offline",
      () => {
        state.online = false;
        renderStatus();
      }
    );

    console.info(
      "[Reticulum Messenger] 1.01 live core ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumLive101 = {
    state,
    refresh: refreshAll
  };
})();

/* =====================================================
   1.02.0-dev · REAL UNREAD / READ STATE
   ===================================================== */

(() => {
  "use strict";

  async function markRead(peer) {
    peer = String(peer || "").trim();

    if (!peer) return;

    try {
      const response =
        await fetch(
          "api/messenger/read",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              peer_hash: peer
            }),
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
          "Read-State fehlgeschlagen"
        );
      }

      window
        .reticulumMessengerChats097
        ?.refresh();

      window
        .reticulumLive101
        ?.refresh();

    } catch (error) {
      console.error(
        "[Messenger 1.02] mark read",
        error
      );
    }
  }

  /*
   * Hook current conversation opener.
   */
  const oldOpen =
    window.openMessengerConversation;

  if (
    typeof oldOpen === "function"
  ) {
    window.openMessengerConversation =
      function(peer) {

        oldOpen(peer);

        /*
         * Erst nach Öffnen markieren,
         * damit die Nachricht sichtbar war.
         */
        setTimeout(
          () => markRead(peer),
          250
        );
      };
  }

  /*
   * Enhance existing chat renderer
   * without replacing the 0.97 core.
   */
  function enhanceChatList() {
    const root =
      document.getElementById(
        "messenger-chat-list"
      );

    if (!root) return;

    root
      .querySelectorAll(
        ".messenger-contact"
      )
      .forEach(item => {

        const badge =
          item.querySelector(
            ".m80-unread"
          );

        item.classList.toggle(
          "m102-unread-chat",
          Boolean(badge)
        );

        if (badge) {
          badge.classList.add(
            "m102-unread-badge"
          );
        }
      });
  }

  /*
   * Watch only the chat list.
   * No text rewriting -> no observer loop.
   */
  function installListObserver() {
    const root =
      document.getElementById(
        "messenger-chat-list"
      );

    if (!root) return;

    enhanceChatList();

    const observer =
      new MutationObserver(
        enhanceChatList
      );

    observer.observe(
      root,
      {
        childList: true,
        subtree: true
      }
    );
  }

  /*
   * Force newest activity first.
   * Backend already sorts this way;
   * this is a frontend safety net.
   */
  async function refreshSorted() {
    try {
      const response =
        await fetch(
          "api/messenger?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const chats =
        Array.isArray(
          data?.conversations
        )
          ? data.conversations
          : [];

      chats.sort(
        (a, b) =>
          Number(
            b?.last_timestamp || 0
          ) -
          Number(
            a?.last_timestamp || 0
          )
      );

      /*
       * Existing renderer still owns HTML.
       * Trigger normal refresh after backend
       * state changed.
       */
      window
        .reticulumMessengerChats097
        ?.refresh();

    } catch (_) {}
  }

  function init() {
    installListObserver();

    setInterval(
      enhanceChatList,
      5000
    );

    setInterval(
      refreshSorted,
      15000
    );

    console.info(
      "[Reticulum Messenger] 1.02 unread core ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumUnread102 = {
    markRead,
    refreshSorted
  };
})();

/* =====================================================
   1.02.1-dev · CHAT OPEN FIX
   ===================================================== */

(() => {
  "use strict";

  const oldOpen =
    window.openMessengerConversation;

  if (typeof oldOpen !== "function") {
    console.error(
      "[Messenger 1.02.1] open function missing"
    );
    return;
  }

  window.openMessengerConversation =
    function(peer) {

      oldOpen(peer);

      const app =
        document.getElementById(
          "messenger-app"
        );

      const conversation =
        document.querySelector(
          ".messenger-conversation"
        );

      if (app) {
        app.style.setProperty(
          "display",
          "block",
          "important"
        );

        app.classList.add(
          "m97-chat-open"
        );
      }

      if (conversation) {
        conversation.style.setProperty(
          "display",
          "flex",
          "important"
        );
      }

      console.info(
        "[Messenger 1.02.1] chat opened",
        peer
      );
    };

})();

/* =====================================================
   1.03.0-dev · RETICULUM LIVE NODE MAP
   ===================================================== */

(() => {
  "use strict";

  const SVG_NS =
    "http://www.w3.org/2000/svg";

  let lastSignature = "";
  let timer = null;

  function shortHash(value) {
    const text =
      String(value || "");

    if (!text) return "—";

    return text.length > 10
      ? text.slice(0, 6) + "…" +
        text.slice(-4)
      : text;
  }

  function svgElement(name, attrs = {}) {
    const el =
      document.createElementNS(
        SVG_NS,
        name
      );

    Object.entries(attrs)
      .forEach(([key, value]) => {
        el.setAttribute(
          key,
          String(value)
        );
      });

    return el;
  }

  function ensureUI() {
    if (
      document.getElementById(
        "n2k-network-viz"
      )
    ) return true;

    const network =
      document.getElementById(
        "reticulum-network"
      );

    const table =
      network?.querySelector(
        ".network-table-wrap"
      );

    if (!network || !table) {
      return false;
    }

    const wrap =
      document.createElement("div");

    wrap.id =
      "n2k-network-viz";

    wrap.innerHTML = `
      <div class="n2k-viz-head">
        <div>
          <div class="n2k-viz-title">
            Live Mesh
          </div>

          <div class="n2k-viz-sub">
            Reticulum Pfade · live
          </div>
        </div>

        <span id="n2k-viz-count">
          0 Nodes
        </span>
      </div>

      <div class="n2k-viz-stage">
        <svg
          id="n2k-viz-svg"
          viewBox="0 0 600 360"
          role="img"
          aria-label="Reticulum Netzwerk"
        ></svg>
      </div>

      <div
        id="n2k-viz-detail"
        class="n2k-viz-detail"
      >
        Node antippen für Details
      </div>
    `;

    table.parentNode.insertBefore(
      wrap,
      table
    );

    return true;
  }

  function showDetail(path) {
    const detail =
      document.getElementById(
        "n2k-viz-detail"
      );

    if (!detail) return;

    detail.innerHTML = `
      <strong>
        ${shortHash(path.destination)}
      </strong>

      <span>
        Hops:
        ${path.hops ?? "—"}
      </span>

      <span>
        Interface:
        ${String(path.interface || "—")}
      </span>

      <span>
        Next Hop:
        ${shortHash(path.next_hop)}
      </span>
    `;
  }

  function render(paths) {
    if (!ensureUI()) return;

    const svg =
      document.getElementById(
        "n2k-viz-svg"
      );

    const count =
      document.getElementById(
        "n2k-viz-count"
      );

    if (!svg) return;

    svg.replaceChildren();

    const defs =
      svgElement("defs");

    const gradient =
      svgElement(
        "linearGradient",
        {
          id: "n2k-link-gradient",
          x1: "0%",
          y1: "0%",
          x2: "100%",
          y2: "100%"
        }
      );

    const stop1 =
      svgElement(
        "stop",
        {
          offset: "0%",
          "stop-color": "#56a8ff"
        }
      );

    const stop2 =
      svgElement(
        "stop",
        {
          offset: "50%",
          "stop-color": "#b57dff"
        }
      );

    const stop3 =
      svgElement(
        "stop",
        {
          offset: "100%",
          "stop-color": "#59dca4"
        }
      );

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    gradient.appendChild(stop3);

    defs.appendChild(gradient);
    svg.appendChild(defs);

    const nodes =
      paths
        .filter(
          p => p &&
          p.destination
        )
        .slice(0, 12);

    if (count) {
      count.textContent =
        nodes.length +
        (nodes.length === 1
          ? " Node"
          : " Nodes");
    }

    const cx = 300;
    const cy = 180;

    /*
     * Animated path lines first,
     * so nodes stay above them.
     */
    nodes.forEach((path, index) => {
      const angle =
        (Math.PI * 2 * index) /
        Math.max(nodes.length, 1)
        - Math.PI / 2;

      const hops =
        Math.max(
          1,
          Math.min(
            Number(path.hops || 1),
            8
          )
        );

      const radius =
        105 + hops * 8;

      const x =
        cx + Math.cos(angle) * radius;

      const y =
        cy + Math.sin(angle) * radius;

      const line =
        svgElement(
          "line",
          {
            x1: cx,
            y1: cy,
            x2: x,
            y2: y,
            class:
              "n2k-viz-link"
          }
        );

      line.style.animationDelay =
        `${index * 0.12}s`;

      svg.appendChild(line);
    });

    /*
     * Local Home Assistant node.
     */
    const core =
      svgElement(
        "g",
        {
          class:
            "n2k-viz-core"
        }
      );

    const corePulse =
      svgElement(
        "circle",
        {
          cx,
          cy,
          r: 30,
          class:
            "n2k-viz-core-pulse"
        }
      );

    const coreCircle =
      svgElement(
        "circle",
        {
          cx,
          cy,
          r: 22,
          class:
            "n2k-viz-core-circle"
        }
      );

    const coreText =
      svgElement(
        "text",
        {
          x: cx,
          y: cy + 4,
          "text-anchor": "middle",
          class:
            "n2k-viz-core-text"
        }
      );

    coreText.textContent = "HA";

    core.appendChild(corePulse);
    core.appendChild(coreCircle);
    core.appendChild(coreText);

    svg.appendChild(core);

    /*
     * Remote Reticulum destinations.
     */
    nodes.forEach((path, index) => {
      const angle =
        (Math.PI * 2 * index) /
        Math.max(nodes.length, 1)
        - Math.PI / 2;

      const hops =
        Math.max(
          1,
          Math.min(
            Number(path.hops || 1),
            8
          )
        );

      const radius =
        105 + hops * 8;

      const x =
        cx + Math.cos(angle) * radius;

      const y =
        cy + Math.sin(angle) * radius;

      const group =
        svgElement(
          "g",
          {
            class:
              "n2k-viz-node",
            tabindex: "0",
            "data-hop": String(
              path.hops ?? 0
            )
          }
        );

      const circle =
        svgElement(
          "circle",
          {
            cx: x,
            cy: y,
            r: 15
          }
        );

      const label =
        svgElement(
          "text",
          {
            x,
            y: y + 31,
            "text-anchor": "middle"
          }
        );

      label.textContent =
        shortHash(
          path.destination
        );

      const hopsLabel =
        svgElement(
          "text",
          {
            x,
            y: y + 4,
            "text-anchor": "middle",
            class:
              "n2k-viz-hop"
          }
        );

      hopsLabel.textContent =
        String(
          path.hops ?? "?"
        );

      group.appendChild(circle);
      group.appendChild(hopsLabel);
      group.appendChild(label);

      group.addEventListener(
        "click",
        () => showDetail(path)
      );

      group.addEventListener(
        "keydown",
        event => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            showDetail(path);
          }
        }
      );

      svg.appendChild(group);
    });
  }

  async function refresh() {
    try {
      if (!ensureUI()) return;

      const response =
        await fetch(
          "api/network?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      const paths =
        Array.isArray(
          data?.paths
        )
          ? data.paths
          : [];

      const visible =
        paths.slice(0, 12);

      const signature =
        JSON.stringify(
          visible.map(
            p => [
              p.destination,
              p.hops,
              p.next_hop,
              p.interface
            ]
          )
        );

      if (
        signature ===
        lastSignature
      ) return;

      lastSignature =
        signature;

      render(visible);

    } catch (error) {
      console.error(
        "[Reticulum 1.03] node map",
        error
      );
    }
  }

  function init() {
    ensureUI();
    refresh();

    timer =
      setInterval(
        refresh,
        10000
      );

    console.info(
      "[Reticulum] 1.03 Live Mesh ready"
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumMesh103 = {
    refresh
  };
})();

/* =====================================================
   1.04.0-dev · CONTACT FAVORITES + HASH SEARCH
   ===================================================== */

(() => {
  "use strict";

  const KEY =
    "reticulum-messenger-favorites";

  function loadFavorites() {
    try {
      const raw =
        localStorage.getItem(KEY);

      const data =
        JSON.parse(raw || "[]");

      return new Set(
        Array.isArray(data)
          ? data.map(String)
          : []
      );
    } catch (_) {
      return new Set();
    }
  }

  function saveFavorites(set) {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [...set]
      )
    );
  }

  function isFavorite(peer) {
    return loadFavorites()
      .has(String(peer || ""));
  }

  function toggleFavorite(peer) {
    peer =
      String(peer || "").trim();

    if (!peer) return;

    const favorites =
      loadFavorites();

    if (favorites.has(peer)) {
      favorites.delete(peer);
    } else {
      favorites.add(peer);
    }

    saveFavorites(favorites);

    window.reticulumMessenger097?.renderContacts(true);
    decorateContacts();
  }

  function decorateContacts() {
    const root =
      document.getElementById(
        "msg-contact-list"
      );

    if (!root || root.querySelector("[data-n2k-contact-entry]")) return;

    const favorites =
      loadFavorites();

    const contacts =
      [...root.querySelectorAll(
        ".messenger-contact[data-m97-peer]"
      )];

    contacts.forEach(item => {
      const peer =
        String(
          item.dataset.m97Peer || ""
        );

      item.dataset.m104Search =
        (
          item.textContent +
          " " +
          peer
        ).toLowerCase();

      const favorite =
        favorites.has(peer);

      item.classList.toggle(
        "m104-favorite-contact",
        favorite
      );

      let star =
        item.querySelector(
          ".m104-favorite"
        );

      if (!star) {
        star =
          document.createElement(
            "span"
          );

        star.className =
          "m104-favorite";

        star.setAttribute(
          "role",
          "button"
        );

        star.setAttribute(
          "tabindex",
          "0"
        );

        star.addEventListener(
          "click",
          event => {
            event.preventDefault();
            event.stopPropagation();

            toggleFavorite(peer);
          }
        );

        star.addEventListener(
          "keydown",
          event => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              event.stopPropagation();

              toggleFavorite(peer);
            }
          }
        );

        item.appendChild(star);
      }

      star.textContent =
        favorite ? "★" : "☆";

      star.title =
        favorite
          ? "Favorit entfernen"
          : "Als Favorit markieren";

      star.setAttribute(
        "aria-label",
        star.title
      );
    });

    /*
     * Favoriten zuerst.
     * Innerhalb der Gruppen bleibt
     * die bestehende Reihenfolge erhalten.
     */
    contacts
      .sort((a, b) => {
        const af =
          favorites.has(
            String(
              a.dataset.m97Peer || ""
            )
          )
            ? 1
            : 0;

        const bf =
          favorites.has(
            String(
              b.dataset.m97Peer || ""
            )
          )
            ? 1
            : 0;

        return bf - af;
      })
      .forEach(item => {
        root.appendChild(item);
      });
  }

  function installEnhancedSearch() {
    const input =
      document.getElementById(
        "m98-search"
      );

    if (!input) return;

    if (
      input.dataset.m104Enhanced === "1"
    ) return;

    input.dataset.m104Enhanced = "1";

    input.placeholder =
      "Name oder Reticulum-Hash suchen…";

    input.addEventListener(
      "input",
      () => {
        const query =
          input.value
            .trim()
            .toLowerCase();

        document
          .querySelectorAll(
            "#msg-contact-list " +
            ".messenger-contact"
          )
          .forEach(item => {

            const peer =
              String(
                item.dataset.m97Peer || ""
              ).toLowerCase();

            const text =
              String(
                item.dataset.m104Search ||
                item.textContent ||
                ""
              ).toLowerCase();

            item.style.display =
              !query ||
              text.includes(query) ||
              peer.includes(query)
                ? ""
                : "none";
          });
      }
    );
  }

  function init() {
    decorateContacts();
    installEnhancedSearch();

    /*
     * Kein MutationObserver:
     * vermeidet frühere Observer-Loops.
     */
    setInterval(
      () => {
        decorateContacts();
        installEnhancedSearch();
      },
      2000
    );

    console.info(
      "[Messenger] 1.04 contact UX ready"
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  } else {
    init();
  }

  window.reticulumContacts104 = {
    toggleFavorite,
    decorateContacts
  };
})();


/* N2K OS UI Layer 1.24.4-beta1 */
(function(){
  "use strict";

  const VERSION="1.30.52-beta1";

  function addStylesheet(){
    if(document.getElementById("n2k-os-css")) return;
    const link=document.createElement("link");
    link.id="n2k-os-css";
    link.rel="stylesheet";
    link.href="static/n2k-os.css?v="+encodeURIComponent(VERSION);
    document.head.appendChild(link);
    const theme=document.createElement("link");
    theme.id="n2k-terminal-css";
    theme.rel="stylesheet";
    theme.href="static/n2k-terminal.css?v="+encodeURIComponent(VERSION);
    document.head.appendChild(theme);
  }

  function activateExistingTab(tab){
    const button=document.querySelector('#n2k-mobile-real-nav [data-real-tab="'+tab+'"]');
    if(button) button.click();
  }

  function openNearestDetails(el){
    if(!el) return;
    const details=el.closest("details");
    if(details) details.open=true;
  }

  function scrollToTarget(selector){
    const el=document.querySelector(selector);
    if(!el) return false;
    openNearestDetails(el);
    window.setTimeout(function(){
      el.scrollIntoView({behavior:"smooth",block:"start"});
    },40);
    return true;
  }

  function switchExistingView(name){
    try{
      if(window.matchMedia("(pointer:fine)").matches &&
         typeof window.n2kDesktopView==="function"){
        window.n2kDesktopView(name);
        return true;
      }
      if(typeof window.n2kMobileRealView==="function"){
        window.n2kMobileRealView(name);
        return true;
      }
    }catch(error){
      console.warn("[N2K OS] view switch",error);
    }
    activateExistingTab(name);
    return false;
  }

  function afterView(name,callback){
    switchExistingView(name);
    window.setTimeout(callback,90);
  }

  function navigate(action){
    document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
      btn.classList.toggle("is-active",btn.dataset.n2kAction===action);
    });

    if(typeof window.n2kShowPage==="function"){
      window.n2kShowPage(action);
      return;
    }

    switch(action){
      case "overview":
        if(typeof window.n2kOpenOverview==="function"){
          window.n2kOpenOverview();
        }else{
          switchExistingView("chats");
          window.scrollTo({top:0,behavior:"smooth"});
        }
        break;
      case "chat":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("chats");
        break;
      case "mesh":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("mesh");
        break;
      case "status":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("settings");
        break;
      case "contacts":
        document.body.classList.remove("n2k-overview-active");
        switchExistingView("contacts");
        break;
      case "setup":
        document.body.classList.remove("n2k-overview-active");
        afterView("settings",function(){
          scrollToTarget("#rnode-probe-button") ||
          scrollToTarget(".n2k-tech-panel");
        });
        break;
      case "settings":
        document.body.classList.remove("n2k-overview-active");
        afterView("settings",function(){
          scrollToTarget("#n2k-status-overview") ||
          scrollToTarget("#msg-settings-view");
        });
        break;
      case "about":
        document.body.classList.remove("n2k-overview-active");
        afterView("settings",function(){
          scrollToTarget(".n2k-about-card");
        });
        break;
    }
  }

  function createDesktopNav(){
    if(document.getElementById("n2k-os-sidebar")) return;

    const nav=document.createElement("aside");
    nav.id="n2k-os-sidebar";
    nav.className="n2k-os-sidebar";
    nav.setAttribute("aria-label","N2K Navigation");

    nav.innerHTML=
      '<div class="n2k-os-sidebar-brand">'+

        '<div><strong>N2K RNS Gateway</strong><small>Reticulum · LXMF NODE</small></div>'+
      '</div>'+
      '<div class="n2k-os-nav-list">'+
        '<button class="n2k-os-nav-button is-active" data-n2k-action="overview"><span class="n2k-os-nav-icon">'+n2kIcon("overview")+'</span>Übersicht</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="chat"><span class="n2k-os-nav-icon">'+n2kIcon("chat")+'</span>Chat</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="mesh"><span class="n2k-os-nav-icon">'+n2kIcon("mesh")+'</span>Living Mesh</button>'+
        '<button class="n2k-os-nav-button n2k-demo-nav-button" data-n2k-action="demo"><span class="n2k-os-nav-icon n2k-demo-nav-icon">▶</span>Demo Mode</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="status"><span class="n2k-os-nav-icon">'+n2kIcon("status")+'</span>Status</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="settings"><span class="n2k-os-nav-icon">'+n2kIcon("settings")+'</span>Einstellungen</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="setup"><span class="n2k-os-nav-icon">'+n2kIcon("radio")+'</span>Setup</button>'+
        '<button class="n2k-os-nav-button" data-n2k-action="about"><span class="n2k-os-nav-icon">'+n2kIcon("about")+'</span>Über / Lizenz</button>'+
      '</div>'+
      '<div class="n2k-os-sidebar-foot">NETFREAK2K<br>OFFGRID · MESH · LOCAL INTELLIGENCE<br><span style="color:#20d8ff">KEIN NETZ KEIN PROBLEM</span></div>';

    nav.addEventListener("click",function(event){
      const button=event.target.closest("[data-n2k-action]");
      if(!button) return;
      navigate(button.dataset.n2kAction);
    });

    document.body.prepend(nav);
  }

  function upgradeMobileNav(){
    const nav=document.getElementById("n2k-mobile-real-nav");
    if(!nav || nav.dataset.n2kOsUpgraded==="1") return;
    nav.dataset.n2kOsUpgraded="1";

    const buttons=Array.from(nav.querySelectorAll("button"));
    const chats=buttons.find(function(b){return b.dataset.realTab==="chats";});
    const status=buttons.find(function(b){return b.dataset.realTab==="settings";});
    const mesh=buttons.find(function(b){return b.dataset.realTab==="mesh";});

    if(chats){
      const s=chats.querySelector("small"); if(s) s.textContent="Chat";
      const b=chats.querySelector("b"); if(b) b.innerHTML=n2kIcon("chat");
    }
    if(mesh){
      const s=mesh.querySelector("small"); if(s) s.textContent="Mesh";
      const b=mesh.querySelector("b"); if(b) b.innerHTML=n2kIcon("mesh");
    }
    if(status){
      const s=status.querySelector("small"); if(s) s.textContent="Status";
      const b=status.querySelector("b"); if(b) b.innerHTML=n2kIcon("status");
    }

    const overview=document.createElement("button");
    overview.type="button";
    overview.innerHTML="<b>"+n2kIcon("overview")+"</b><small>Übersicht</small>";
    overview.addEventListener("click",function(){
      if(typeof window.n2kOsMobilePage==="function"){
        window.n2kOsMobilePage("overview");
        return;
      }
      buttons.concat([overview,more]).forEach(function(b){b.classList.remove("active");});
      overview.classList.add("active");
      window.scrollTo({top:0,behavior:"smooth"});
    });
    nav.prepend(overview);

    const more=document.createElement("button");
    more.type="button";
    more.innerHTML="<b>"+n2kIcon("more")+"</b><small>Mehr</small>";
    more.addEventListener("click",function(){
      buttons.concat([overview,more]).forEach(function(b){b.classList.remove("active");});
      more.classList.add("active");
      scrollToTarget(".n2k-about-card") || scrollToTarget(".n2k-tech-panel");
    });
    nav.appendChild(more);
  }

  function updateVersionLabels(){
    window.N2K_APP_VERSION=VERSION;

    // Keep the top status/header bar intentionally clean.
    // Version remains available in About/diagnostics only.
    const canonical=document.querySelector(".n2k-title-row > h1");
    if(canonical) canonical.textContent="N2K RNS Gateway";

    const version=document.getElementById("n2k-modern-title-version");
    if(version){
      version.textContent="";
      version.hidden=true;
      version.style.display="none";
    }

    document.querySelectorAll(".n2k-about-row strong").forEach(function(el){
      if(el.textContent.includes("N2K RNS Gateway")) {
        el.textContent="N2K RNS Gateway · "+VERSION;
      }
    });
  }

  function init(){
    const viewport=document.querySelector('meta[name="viewport"]');
    if(viewport){
      const current=viewport.getAttribute("content") || "width=device-width,initial-scale=1";
      if(!/viewport-fit\s*=\s*cover/i.test(current)){
        viewport.setAttribute("content",current+",viewport-fit=cover");
      }
    }

    addStylesheet();
    document.body.classList.add("n2k-os-ready");
    createDesktopNav();
    upgradeMobileNav();
    updateVersionLabels();
    console.info("[N2K OS] UI layer "+VERSION+" ready");
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init,{once:true});
  }else{
    init();
  }
})();


/* N2K OS Overview Dashboard 1.24.4-beta1 */
(function(){
  "use strict";

  const MAX_EVENTS=5;
  let showAllEvents=false;
  let overviewMeshContacts=[];
  let overviewChats=[];
  let overviewChatsLastFetch=0;
  let overviewChatsFetching=false;
  const previous=new Map();
  const events=[];
  let overviewMeshLastFetch=0;
  let overviewMeshFetching=false;
  let overviewMeshLoaded=false;
  let overviewMeshLastData=null;

  function byId(id){return document.getElementById(id);}

  function textOf(id,fallback){
    const el=byId(id);
    const value=(el && el.textContent ? el.textContent : "").trim();
    return value || fallback || "—";
  }

  function statusClass(value){
    const v=String(value||"").toLowerCase();
    if(/online|bereit|up|aktiv|ok|running|verbunden/.test(v)) return "ok";
    if(/offline|down|fehler|error|aus/.test(v)) return "bad";
    return "";
  }

  function addEvent(label,kind,eventTime){
    if(!label) return;
    events.unshift({
      time:eventTime instanceof Date ? eventTime : new Date(),
      label:String(label),
      kind:kind||""
    });
    if(events.length>MAX_EVENTS) events.length=MAX_EVENTS;
    renderEvents();
  }

  function watchValue(key,value,label){
    const normalized=String(value||"").trim();
    if(!normalized) return;
    if(!previous.has(key)){
      previous.set(key,normalized);
      return;
    }
    const old=previous.get(key);
    if(old===normalized) return;
    previous.set(key,normalized);
    addEvent(label+": "+normalized,statusClass(normalized));
  }

  function ensureOverview(){
    let overview=byId("n2k-os-overview");
    if(overview) return overview;

    const stage=byId("n2k-mobile-real-content");
    if(!stage) return null;

    overview=document.createElement("section");
    overview.id="n2k-os-overview";
    overview.setAttribute("aria-label","N2K Übersicht");
    overview.innerHTML=
      '<div class="n2k-bento-grid">'+
        '<section class="n2k-bento-card n2k-bento-mesh-card" aria-label="Living Mesh Netzwerk">'+
          '<div class="n2k-bento-mesh">'+
            '<div class="n2k-constellation-head n2k-universe-head">'+
              '<div><div class="n2k-constellation-title n2k-universe-title">N2K Mesh Universe</div><div class="n2k-constellation-sub n2k-universe-sub">Live activity · routes · relays · LXMF presence</div></div>'+
              '<div class="n2k-constellation-stats n2k-universe-stats" aria-label="Mesh-Statistik">'+
                '<span><b id="n2k-ov-live">—</b> live</span>'+
                '<span><b id="n2k-ov-seen">—</b> seen</span>'+
                '<span><b id="n2k-ov-paths">—</b> paths</span>'+
                '<span><b id="n2k-ov-relays">—</b> relays</span>'+
              '</div>'+
            '</div>'+
            '<div class="n2k-universe-toolbar n2k-overview-universe-toolbar">'+
              '<div class="n2k-constellation-filters n2k-universe-filters" role="group" aria-label="Zeitraum">'+
                '<button type="button" data-n2k-map-filter="live" class="active">Live</button>'+
                '<button type="button" data-n2k-map-filter="hour">1 h</button>'+
                '<button type="button" data-n2k-map-filter="five">5 h</button>'+
                '<button type="button" data-n2k-map-filter="replay">Replay</button>'+
              '</div>'+
            '</div>'+
            '<div id="n2k-overview-mesh-stage" class="n2k-constellation-stage n2k-universe-stage n2k-overview-mesh-stage" role="button" tabindex="0" aria-label="Living Mesh öffnen">'+
              '<svg id="n2k-overview-live-svg" class="n2k-universe-svg" viewBox="0 0 1100 620" role="img" aria-label="N2K Mesh Universe · Reticulum Visualisierung"></svg>'+
              '<div id="n2k-overview-mesh-empty" class="n2k-constellation-empty n2k-overview-mesh-empty" hidden>Noch keine LXMF-Nodes in diesem Zeitraum.</div>'+
              '<div class="n2k-universe-legend" aria-hidden="true">'+
                '<span><i class="radio"></i>Radio</span>'+
                '<span><i class="internet"></i>Internet</span>'+
                '<span><i class="local"></i>Local</span>'+
                '<span><i class="ghost"></i>Ghost</span>'+
              '</div>'+
            '</div>'+
          '</div>'+
        '</section>'+
        '<section class="n2k-bento-card n2k-bento-chat" aria-label="LXMF Messenger Vorschau"><div class="n2k-bento-head"><div><span class="n2k-bento-eyebrow">LXMF MESSENGER</span><h2>Deine Chats</h2></div><span class="n2k-bento-live-dot" aria-hidden="true"></span></div><p class="n2k-bento-caption">Nachrichten und ungelesene Gespräche im Blick.</p><div id="n2k-overview-chat-list" class="n2k-bento-chat-list" aria-live="polite"><span class="n2k-bento-empty">Chats werden geladen…</span></div><button type="button" class="n2k-bento-action" data-n2k-overview-page="chat">Messenger öffnen <span aria-hidden="true">↗</span></button></section>'+
        '<aside class="n2k-bento-card n2k-bento-system" aria-label="Systemcheck und Netzprotokoll"><div class="n2k-bento-matrix" aria-hidden="true">01 · RNS · LXMF<br>7A 03 · MESH · 91<br>LINK · 0F · ROUTE<br>DATA · 42 · LIVE</div><div class="n2k-bento-head"><div><span class="n2k-bento-eyebrow">SYSTEM &amp; MESH</span><h2>Live-Signale</h2></div><span class="n2k-bento-live-dot" aria-hidden="true"></span></div><p id="n2k-bento-selftest" class="n2k-bento-selftest">Systemcheck öffnen für den aktuellen Prüfbericht.</p><div id="n2k-live-event-list" class="n2k-live-event-list"><span class="n2k-event-empty">Warte auf Status- oder Announce-Ereignisse</span></div><div class="n2k-bento-actions"><button type="button" class="n2k-bento-action n2k-bento-announce" data-n2k-overview-announce>Jetzt announcen <span aria-hidden="true">↗</span></button><button type="button" class="n2k-bento-action n2k-bento-action-secondary" data-n2k-overview-page="status">Systemcheck ansehen <span aria-hidden="true">↗</span></button></div><p id="n2k-overview-announce-result" class="n2k-overview-announce-result" aria-live="polite"></p></aside>'+
      '</div>';

    stage.prepend(overview);

    overview.querySelectorAll("[data-n2k-map-filter]").forEach(function(btn){
      btn.addEventListener("click",function(event){
        event.preventDefault();
        event.stopPropagation();

        if(typeof window.n2kSetMeshFilter==="function"){
          window.n2kSetMeshFilter(btn.dataset.n2kMapFilter||"live");
        }
      });
    });

    const activeFilter=typeof window.n2kGetMeshFilter==="function"
      ? window.n2kGetMeshFilter()
      : "live";

    overview.querySelectorAll("[data-n2k-map-filter]").forEach(function(btn){
      btn.classList.toggle(
        "active",
        btn.dataset.n2kMapFilter===activeFilter
      );
    });

    if(!window.__n2kOverviewMeshFilterSync){
      window.__n2kOverviewMeshFilterSync=true;

      window.addEventListener("n2k-mesh-filter-change",function(){
        if(overviewMeshLastData){
          renderOverviewMesh(overviewMeshLastData);
        }
      });
    }

    const mesh=byId("n2k-overview-mesh-stage");
    if(mesh){
      const open=function(){
        document.body.classList.remove("n2k-overview-active");
        if(typeof window.n2kDesktopView==="function" && window.matchMedia("(pointer:fine)").matches){
          window.n2kDesktopView("mesh");
        }else if(typeof window.n2kMobileRealView==="function"){
          window.n2kMobileRealView("mesh");
        }
        document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
          btn.classList.toggle("is-active",btn.dataset.n2kAction==="mesh");
        });
      };
      mesh.addEventListener("click",open);
      mesh.addEventListener("keydown",function(e){
        if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}
      });
    }

    const announceButton=overview.querySelector("[data-n2k-overview-announce]");
    if(announceButton) announceButton.addEventListener("click",announceFromOverview);

    overview.querySelectorAll("[data-n2k-overview-page]").forEach(function(button){
      button.addEventListener("click",function(){
        if(typeof window.n2kShowPage==="function") window.n2kShowPage(button.dataset.n2kOverviewPage);
      });
    });

    return overview;
  }

  async function announceFromOverview(){
    const button=byId("n2k-os-overview")?.querySelector("[data-n2k-overview-announce]");
    const result=byId("n2k-overview-announce-result");
    if(!button||button.disabled) return;
    button.disabled=true;
    if(result) result.textContent="RNS- und LXMF-Announce werden angefordert…";
    const requests=[["RNS","api/node/announce"],["LXMF","api/node/lxmf/announce"]];
    try{
      const outcomes=await Promise.all(requests.map(async function(entry){
        const response=await fetch(entry[1],{method:"POST",cache:"no-store"});
        const data=await response.json();
        return {name:entry[0],ok:response.ok&&data.ok===true,retry:Number(data.retry_after||0),error:String(data.error||"")};
      }));
      const ok=outcomes.filter(item=>item.ok).map(item=>item.name);
      const failed=outcomes.filter(item=>!item.ok);
      if(ok.length){
        addEvent(ok.join(" + ")+" Announce angefordert","ok");
        if(result) result.textContent=ok.join(" + ")+" Announce angefordert."+(failed.length?" · "+failed.map(item=>item.retry?"Cooldown "+item.name+": "+item.retry+" s":item.name+": "+(item.error||"fehlgeschlagen")).join(" · "):"");
      }else if(result){
        result.textContent=failed.map(item=>item.retry?"Cooldown "+item.name+": "+item.retry+" s":item.name+": "+(item.error||"fehlgeschlagen")).join(" · ");
      }
    }catch(error){
      if(result) result.textContent="Announce API nicht erreichbar: "+String(error.message||error);
    }finally{
      setTimeout(function(){button.disabled=false;},2500);
    }
  }

  function escapeSvg(value){
    return String(value==null?"":value)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  }

  function renderOverviewMesh(data){
    const target=byId("n2k-overview-live-svg");
    if(!target) return;
    const contacts=Array.isArray(data.contacts)?data.contacts:[];
    const live=contacts.filter(function(item){
      return Number(item.age_seconds||0)<=120;
    }).length;
    const known=Number(data.count);
    const mode=typeof window.n2kGetMeshFilter==="function"
      ? window.n2kGetMeshFilter()
      : "live";

    const visibleContacts=contacts.filter(function(item){
      const age=Number(item.age_seconds||0);

      if(mode==="live"){
        return age<=120 || item.seen_during_scan===true;
      }

      if(mode==="hour" || mode==="replay"){
        return age<=3600;
      }

      if(mode==="five"){
        return age<=18000;
      }

      return age<=86400;
    });

    const pathValue=Number(data.rns_path_count);
    const paths=Number.isFinite(pathValue)?pathValue:null;
    const relays=visibleContacts.filter(function(item){
      const hops=Number(item.hops);
      return item.path_known===true && Number.isFinite(hops) && hops<=2;
    }).length;
    const numbers={
      "n2k-ov-live":String(live),
      "n2k-ov-seen":String(visibleContacts.length),
      "n2k-ov-paths":paths===null?"—":paths.toLocaleString("de-DE"),
      "n2k-ov-relays":String(relays)
    };
    Object.keys(numbers).forEach(function(id){
      const node=byId(id); if(node) node.textContent=numbers[id];
    });
    const badge=byId("n2k-overview-live-badge");
    if(badge) badge.textContent=live+" LIVE";
    const empty=byId("n2k-overview-mesh-empty");
    if(empty){
      empty.hidden=contacts.length>0||(paths!==null&&paths>0);
      empty.textContent="Noch keine LXMF Announces oder RNS-Pfade im letzten Tag";
    }

    if(typeof window.n2kRenderLivingMesh==="function"){
      window.n2kRenderLivingMesh(
        {
          contacts:contacts,
          count:Number.isFinite(known)?known:contacts.length,
          rns_path_count:paths||0
        },
        target
      );

      return;
    }

    const shown=contacts.slice(0,24);
    const core='<g transform="translate(550 310)">'+
      '<circle r="48" fill="rgba(72,199,177,.10)" stroke="rgba(112,238,213,.35)" stroke-width="1.5"><animate attributeName="r" values="46;52;46" dur="4.8s" repeatCount="indefinite"/></circle>'+
      '<circle r="28" fill="rgba(72,199,177,.14)" stroke="#74e7cb" stroke-width="2"><animate attributeName="r" values="26;30;26" dur="3.2s" repeatCount="indefinite"/></circle>'+
      '<circle r="8" fill="#c7fff1"><animate attributeName="r" values="7;10;7" dur="2.4s" repeatCount="indefinite"/></circle>'+
      '<text y="62" text-anchor="middle" fill="#c4d9dd" font-size="15" font-weight="700">N2K CORE</text></g>';
    const rings='<g fill="none" stroke="rgba(137,194,201,.12)" stroke-width="1">'+
      '<ellipse cx="550" cy="310" rx="210" ry="135"/><ellipse cx="550" cy="310" rx="370" ry="235"/></g>';
    const links=[];
    const nodes=[];
    shown.forEach(function(item,index){
      const hash=String(item.destination_hash||"");
      let seed=parseInt(hash.slice(0,8),16);
      if(!Number.isFinite(seed)) seed=index*2654435761;
      const angle=(index/Math.max(1,shown.length))*Math.PI*2+(seed%97)/97*.18;
      const radius=175+(index%4)*58;
      const x=550+Math.cos(angle)*radius;
      const y=310+Math.sin(angle)*Math.min(235,radius*.63);
      const name=String(item.display_name||("Node "+hash.slice(0,8))).slice(0,22);
      const route=item.path_known===true;
      if(route) links.push('<line x1="550" y1="310" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="rgba(103,224,196,.38)" stroke-width="1.4" stroke-dasharray="4 7"><animate attributeName="stroke-dashoffset" values="22;0" dur="'+(3.1+(index%4)*.6).toFixed(2)+'s" begin="'+(-index*.27).toFixed(2)+'s" repeatCount="indefinite"/></line>');
      nodes.push('<g transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')" opacity="'+(Number(item.age_seconds||0)<=120?"1":".76")+'">'+
        '<title>'+escapeSvg(name+" · "+hash+" · "+(route?"RNS-Pfad bekannt":"zuletzt gehört"))+'</title>'+
        '<circle r="17" fill="rgba(80,210,183,.10)" stroke="'+(route?"#64e6c0":"#75bdd2")+'" stroke-width="1.5"><animate attributeName="r" values="15;20;15" dur="'+(3.4+(index%5)*.55).toFixed(2)+'s" begin="'+(-index*.31).toFixed(2)+'s" repeatCount="indefinite"/></circle>'+
        '<circle r="5" fill="'+(Number(item.age_seconds||0)<=120?"#70f2c0":"#78bfd6")+'"><animate attributeName="opacity" values=".62;1;.62" dur="'+(2.2+(index%4)*.45).toFixed(2)+'s" begin="'+(-index*.23).toFixed(2)+'s" repeatCount="indefinite"/></circle>'+
        '<text y="31" text-anchor="middle" fill="#d5e6ed" font-size="12">'+escapeSvg(name)+'</text></g>');
    });
    target.setAttribute("viewBox","0 0 1100 620");
    target.dataset.n2kDashboardRendered="true";
    target.innerHTML='<g class="n2k-overview-rings">'+rings+'</g>'+
      '<g class="n2k-overview-routes">'+links.join("")+'</g>'+core+
      '<g class="n2k-overview-nodes">'+nodes.join("")+'</g>';
  }

  async function refreshOverviewMesh(){
    const now=Date.now();
    if(overviewMeshFetching||now-overviewMeshLastFetch<15000) return;
    overviewMeshLastFetch=now;
    overviewMeshFetching=true;
    try{
      const contactsResponse=await fetch("api/messenger/contacts?ts="+now,{cache:"no-store"});
      const contactsData=await contactsResponse.json();
      if(!contactsResponse.ok||!contactsData||!contactsData.ok){
        throw new Error((contactsData&&contactsData.error)||("Kontakte HTTP "+contactsResponse.status));
      }

      let networkData=null;
      try{
        const networkResponse=await fetch("api/network?ts="+now,{cache:"no-store"});
        const parsed=await networkResponse.json();
        if(networkResponse.ok&&parsed&&parsed.ok!==false) networkData=parsed;
      }catch(_networkError){}

      const currentSeconds=Math.floor(Date.now()/1000);
      const pathItems=Array.isArray(networkData&&networkData.paths)?networkData.paths:[];
      const pathMap=new Map();
      pathItems.forEach(function(path){
        const peer=String(path&&path.destination||"").trim().toLowerCase();
        if(/^[0-9a-f]{32}$/.test(peer)) pathMap.set(peer,path);
      });
      const contacts=(Array.isArray(contactsData.contacts)?contactsData.contacts:[])
        .map(function(item){
          const peer=String(item&&item.destination_hash||"").trim().toLowerCase();
          let lastSeen=Number(item&&item.last_seen||0);
          if(lastSeen>1e12) lastSeen=Math.floor(lastSeen/1000);
          const age=lastSeen>0?Math.max(0,currentSeconds-lastSeen):86401;
          const path=pathMap.get(peer);
          return Object.assign({},item,{
            destination_hash:peer,
            age_seconds:age,
            hops:path&&path.hops,
            interface:path&&path.interface||"",
            path_known:!!path
          });
        })
        .filter(function(item){
          return /^[0-9a-f]{32}$/.test(item.destination_hash)&&item.age_seconds<=86400;
        })
        .sort(function(a,b){return a.age_seconds-b.age_seconds;});
      const pathCount=Number(networkData&&networkData.path_count);
      overviewMeshLoaded=true;
      overviewMeshContacts=contacts;
      overviewMeshLastData={
        contacts:contacts,
        count:contacts.length,
        rns_path_count:Number.isFinite(pathCount)?pathCount:pathItems.length
      };
      renderOverviewMesh(overviewMeshLastData);
      watchNodeAnnounces();
    }catch(error){
      if(!overviewMeshLoaded){
        const empty=byId("n2k-overview-mesh-empty");
        if(empty){empty.hidden=false;empty.textContent="Kontakte für die Übersicht konnten nicht geladen werden";}
      }
      console.warn("[N2K Overview] Kontakte nicht verfügbar",error);
    }finally{
      overviewMeshFetching=false;
    }
  }
  function watchNodeAnnounces(){
    const contacts=Array.isArray(window.n2kMeshLeaderboardContacts)
      ? window.n2kMeshLeaderboardContacts
      : overviewMeshContacts;
    if(!Array.isArray(contacts)||!contacts.length) return;
    const key="announce_seen";
    const seen=previous.get(key)||new Map();
    const currentSeconds=Date.now()/1000;
    const updates=[];
    contacts.forEach(item=>{
      const peer=String(item&&item.destination_hash||"").toLowerCase();
      let lastSeen=Number(item&&item.last_seen||0);
      if(lastSeen>1e12) lastSeen/=1000;
      if(!/^[0-9a-f]{32}$/.test(peer)||!Number.isFinite(lastSeen)||lastSeen<=0) return;
      const name=String(item.display_name||item.announced_name||peer.slice(0,8)+"…").trim();
      const before=seen.get(peer);
      const age=currentSeconds-lastSeen;
      if(age>=0&&age<300&&(before===undefined||lastSeen>before)){
        updates.push({lastSeen,name});
      }
      seen.set(peer,lastSeen);
    });
    previous.set(key,seen);
    updates.sort((a,b)=>b.lastSeen-a.lastSeen).slice(0,3).forEach(item=>
      addEvent("Announce · "+item.name,"ok",new Date(item.lastSeen*1000))
    );
  }

  function update(){
    if(!ensureOverview()) return;
    updateChatPreview();
    refreshOverviewChats();
    watchNodeAnnounces();
    refreshOverviewMesh();

    const rnode=textOf("hero-lora",textOf("n2k-status-rnode","—"));
    const rnodeSub=textOf("rnode-live-rate",textOf("n2k-status-rnode-sub","Live-Funkhardware"));
    const rns=textOf("hero-rns",textOf("n2k-status-rns","—"));
    const rnsSub=textOf("shared-name","Reticulum Network Stack");
    const lxmf=textOf("n2k-status-lxmf",textOf("messenger-status-text","—"));
    const propagation=textOf("n2k-propagation-runtime","—");
    const propagationState=window.n2kPropagationStatus||null;
    const propagationDetail=textOf("n2k-propagation-last-sync","—");
    const propagationSuccess=textOf("n2k-propagation-last-success","—");
    const selectedNode=textOf("n2k-propagation-selected","");
    const selectedHash=(selectedNode.match(/[0-9a-f]{8,}/i)||[])[0]||"";
    let backbone=propagation!=="—" ? propagation : "Status wird geprüft";
    let backboneSub=propagationDetail;
    if(propagationState){
      const sync=String(propagationState.sync_result||"").toUpperCase();
      if(!propagationState.enabled){
        backbone="Deaktiviert";backboneSub="Store & Forward ist ausgeschaltet";
      }else if(!propagationState.runtime_enabled){
        backbone=propagationState.auto_discovery?"Aktiviert · wartet auf Propagation Node":"Aktiviert · kein Node gesetzt";
        backboneSub=Number(propagationState.candidate_count||0)+" Nodes bekannt";
      }else if(["NO_PATH","LINK_FAILED","TRANSFER_FAILED","NO_IDENTITY_RCVD","NO_ACCESS","FAILED","ERROR"].includes(sync)){
        backbone="Letzter Sync fehlgeschlagen";backboneSub=String(propagationState.error||propagationState.sync_result||"Fehler");
      }else if(["READY","IDLE","REQUESTED","PATH_REQUESTED","LINK_ESTABLISHING","LINK_ESTABLISHED","REQUEST_SENT","RECEIVING","RESPONSE_RECEIVED","COMPLETE"].includes(sync)){
        backbone=sync==="COMPLETE"?"Sync erfolgreich":"Store & Forward bereit";
        backboneSub=(propagationState.runtime_node?String(propagationState.runtime_node).slice(0,8)+"…":"Propagation Node aktiv")+(propagationState.selected_hops?" · "+propagationState.selected_hops+" Hop(s)":"");
      }
    }
    if(!propagationState){
    if(/warte auf serverantwort/i.test(propagation)){backbone="Antwort ausstehend";backboneSub="Server antwortet"+(selectedHash?" · "+selectedHash.slice(0,8)+"…":"");}
    else if(/suche serverpfad/i.test(propagation)){backbone="Serverpfad wird gesucht";backboneSub=textOf("n2k-propagation-candidate-count","Discovery aktiv");}
    else if(/kein serverpfad/i.test(propagation)){backbone="Kein Propagation Node";backboneSub=textOf("n2k-propagation-candidate-count","Noch kein erreichbarer Server");}
    else if(/verbindung gescheitert|link_failed/i.test(propagation)){
      backbone="Letzter Sync fehlgeschlagen";
      backboneSub=(selectedHash?"Node "+selectedHash.slice(0,8)+"… · ":"")+"Versuch "+propagationDetail+
        (propagationSuccess!=="—"?" · Zuletzt erfolgreich "+propagationSuccess:"");
    }
    else if(/übertragung gescheitert|transfer_failed|identität nicht bestätigt|no_identity_rcvd|zugriff verweigert|no_access/i.test(propagation)){
      backbone="Letzter Sync fehlgeschlagen";
      backboneSub=propagationDetail+(propagationSuccess!=="—"?" · Zuletzt erfolgreich "+propagationSuccess:"");
    }
    else if(/abruf erfolgreich/i.test(propagation)){backbone="Sync erfolgreich";backboneSub=textOf("n2k-propagation-last-success",propagationDetail);}
    else if(/empfange nachrichten/i.test(propagation)){backbone="Empfängt Nachrichten";backboneSub=selectedHash?"Node · "+selectedHash.slice(0,8)+"…":"Übertragung läuft";}
    }
    const backboneChip=byId("n2k-chip-backbone");
    if(backboneChip){
      const chipState=/fehlgeschlagen|kein serverpfad|fehler|verweigert/i.test(backbone) ? "error"
        : /serverpfad wird gesucht|kein propagation node|antwort ausstehend|sync angefordert/i.test(backbone) ? "warn"
        : /sync erfolgreich|server verbunden|empfängt nachrichten|\bbereit\b/i.test(backbone) ? "online"
        : /\baus\b|nicht aktiv/i.test(backbone) ? "offline" : "wait";
      backboneChip.classList.remove("is-online","is-warn","is-offline","is-error","is-wait");
      backboneChip.classList.add("is-"+chipState);
      backboneChip.title="Store & Forward · "+backbone+" · "+backboneSub;
      backboneChip.setAttribute("aria-label","Store & Forward: "+backbone);
    }

    const map={
      "n2k-ov-live":textOf("n2k-ov-live","—"),
      "n2k-ov-seen":textOf("n2k-ov-seen","—"),
      "n2k-ov-paths":textOf("n2k-ov-paths","—"),
      "n2k-ov-relays":textOf("n2k-ov-relays","—")
    };

    const propagationDot=byId("n2k-ov-backbone-dot");
    if(propagationDot){
      const kind=/fehler|gescheitert|verweigert|ERROR|FAILED|NO_PATH|NO_ACCESS/i.test(backbone) ? "bad"
        : /bereit|erfolgreich|COMPLETE/i.test(backbone) ? "ok" : "wait";
      propagationDot.className="n2k-overview-dot "+kind;
    }

    watchValue("rnode",rnode,"RNode Status");
    watchValue("rns",rns,"Reticulum Status");
    watchValue("lxmf",lxmf,"LXMF Status");
    watchValue("backbone",backbone,"Store & Forward");

    const pathsValue=map["n2k-ov-paths"];
    const liveValue=map["n2k-ov-live"];
    if(previous.has("paths") && previous.get("paths")!==String(pathsValue||"").trim()){
      previous.set("paths",String(pathsValue||"").trim());
      addEvent("Reticulum kennt jetzt "+pathsValue+" Pfade","ok");
    }else if(!previous.has("paths") && String(pathsValue||"").trim()){
      previous.set("paths",String(pathsValue||"").trim());
    }

    /* Live-node counts fluctuate constantly and were flooding the activity
       feed. Keep the current count on the Mesh card, but do not log every
       2 -> 3 -> 5 -> 6 change as an activity event. */
    if(String(liveValue||"").trim()){
      previous.set("live",String(liveValue||"").trim());
      const badge=byId("n2k-overview-live-badge");
      if(badge){
        const num=String(liveValue||"").trim();
        badge.textContent=(num && num!=="—") ? num+" KNOTEN ONLINE" : "LIVE";
      }
    }
  }

  function overviewChatName(chat){
    const name=String(chat&&chat.display_name||"").trim();
    if(name&&!/^Kontakt\s+[0-9A-F]+$/i.test(name)) return name;
    const peer=String(chat&&chat.peer_hash||"");
    return peer?"Kontakt "+peer.slice(0,6).toUpperCase():"Unbekannt";
  }

  function refreshOverviewChats(){
    const now=Date.now();
    if(overviewChatsFetching||now-overviewChatsLastFetch<10000) return;
    overviewChatsLastFetch=now;
    overviewChatsFetching=true;
    fetch("api/messenger?ts="+now,{cache:"no-store"})
      .then(function(response){
        if(!response.ok) throw new Error("Chats HTTP "+response.status);
        return response.json();
      })
      .then(function(data){
        overviewChats=Array.isArray(data&&data.conversations)?data.conversations:[];
        updateChatPreview();
      })
      .catch(function(error){
        const target=byId("n2k-overview-chat-list");
        if(target&&!overviewChats.length){
          target.innerHTML='<span class="n2k-bento-empty">Letzte Chats konnten gerade nicht geladen werden.</span>';
        }
        console.warn("[N2K Overview] Chats nicht verfügbar",error);
      })
      .finally(function(){overviewChatsFetching=false;});
  }

  function updateChatPreview(){
    const target=byId("n2k-overview-chat-list");
    if(!target) return;
    if(!overviewChats.length){
      target.innerHTML='<span class="n2k-bento-empty">Noch keine letzten Gespräche vorhanden.</span>';
      return;
    }
    target.innerHTML="";
    overviewChats.slice().sort(function(a,b){
      return Number(b.last_timestamp||0)-Number(a.last_timestamp||0);
    }).slice(0,3).forEach(function(chat){
      const peer=String(chat.peer_hash||"");
      const name=overviewChatName(chat);
      const raw=String(chat.last_message||"Noch keine Nachrichten");
      const preview=raw.startsWith("N2KPHOTO/1|image/jpeg|")?"📷 Foto":raw;
      const row=document.createElement("button");
      row.type="button";row.className="n2k-bento-chat-row";
      const avatar=document.createElement("span");avatar.className="n2k-bento-avatar";avatar.textContent=name.slice(0,1).toUpperCase();
      const body=document.createElement("span");body.className="n2k-bento-chat-body";
      const title=document.createElement("strong");title.textContent=name;
      const snippet=document.createElement("small");snippet.textContent=preview;
      body.append(title,snippet);row.append(avatar,body);
      const unread=Number(chat.unread||0);
      if(unread>0){const badge=document.createElement("i");badge.className="n2k-bento-unread";badge.textContent=String(unread);row.appendChild(badge);}
      row.addEventListener("click",function(){
        if(typeof window.n2kShowPage==="function") window.n2kShowPage("chat");
        setTimeout(function(){
          if(peer&&typeof window.openMessengerConversation==="function") window.openMessengerConversation(peer);
        },180);
      });
      target.appendChild(row);
    });
  }

  function renderEvents(){
    const root=byId("n2k-live-event-list")||byId("n2k-overview-activity-list");
    if(!root) return;
    if(!events.length){
      root.innerHTML='<span class="n2k-event-empty">Warte auf Status- oder Announce-Ereignisse</span>';
      return;
    }

    root.innerHTML="";
    events.slice(0,5).forEach(function(event){
      const row=document.createElement("div");
      row.className="n2k-live-event-chip "+(event.kind||"");
      const hh=String(event.time.getHours()).padStart(2,"0");
      const mm=String(event.time.getMinutes()).padStart(2,"0");
      row.innerHTML="<i></i><time>"+hh+":"+mm+"</time><span></span>";
      row.querySelector("span").textContent=event.label;
      root.appendChild(row);
    });
  }

  function openOverview(){
    ensureOverview();
    if(typeof window.n2kShowPage==="function"){
      window.n2kShowPage("overview");
    }else{
      document.body.classList.add("n2k-overview-active");
      document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
        btn.classList.toggle("is-active",btn.dataset.n2kAction==="overview");
      });
    }
    window.scrollTo({top:0,behavior:"smooth"});
    update();
  }

  function boot(){
    ensureOverview();
    update();
    setInterval(update,1500);
    window.n2kOpenOverview=openOverview;

    /* First page after load is the new overview. */
    setTimeout(openOverview,120);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K OS Mobile Router 1.24.4-beta1 */
(function(){
  "use strict";

  const PAGE_CLASSES=[
    "n2k-os-mobile-page-overview",
    "n2k-os-mobile-page-chat",
    "n2k-os-mobile-page-mesh",
    "n2k-os-mobile-page-status",
    "n2k-os-mobile-page-contacts",
    "n2k-os-mobile-page-more",
    "n2k-os-mobile-chat-open"
  ];

  function isMobile(){
    return window.matchMedia("(max-width:900px)").matches;
  }

  function byId(id){return document.getElementById(id);}

  function stage(){
    return byId("n2k-mobile-real-content");
  }

  function ensureMore(){
    let more=byId("n2k-os-more");
    if(more) return more;
    const root=stage();
    if(!root) return null;

    more=document.createElement("section");
    more.id="n2k-os-more";
    more.setAttribute("aria-label","Mehr");
    more.innerHTML=
      '<div class="n2k-overview-panel-head"><div><strong>Mehr</strong><br><small>Weitere Bereiche des Gateways</small></div></div>'+
      '<div class="n2k-os-more-grid">'+
        '<button class="n2k-os-more-card" type="button" data-n2k-mobile-target="settings"><b>'+n2kIcon("settings")+'Einstellungen</b><span>Gateway, Identity und Netzwerk konfigurieren</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-n2k-mobile-target="setup"><b>'+n2kIcon("setup")+'Setup</b><span>RNode und Gateway Schritt für Schritt einrichten</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-n2k-mobile-target="about"><b>'+n2kIcon("about")+'Über / Lizenz</b><span>Version, Projekt- und Lizenzinformationen</span></button>'+
      '</div>';

    root.prepend(more);

    more.addEventListener("click",function(event){
      const button=event.target.closest("[data-n2k-mobile-target]");
      if(!button) return;
      const target=button.dataset.n2kMobileTarget;
      if(target==="contacts"){
        showPage("contacts");
      }else if(target==="settings"){
        showPage("status");
        setTimeout(function(){
          document.getElementById("n2k-status-overview")?.scrollIntoView({behavior:"smooth",block:"start"});
        },80);
      }else if(target==="setup"){
        showPage("status");
        setTimeout(function(){
          (document.getElementById("n2k-setup-assistant") ||
           document.getElementById("n2k-hardware-usb-card"))?.scrollIntoView({behavior:"smooth",block:"start"});
        },80);
      }else if(target==="about"){
        showPage("status");
        setTimeout(function(){
          document.querySelector(".n2k-about-card")?.scrollIntoView({behavior:"smooth",block:"start"});
        },80);
      }
    });

    return more;
  }

  function clearPageClasses(){
    PAGE_CLASSES.forEach(function(name){document.body.classList.remove(name);});
    document.body.classList.remove("n2k-overview-active");
  }

  function forceHidden(el,hidden,display){
    if(!el) return;
    el.hidden=!!hidden;
    el.style.setProperty("display",hidden ? "none" : (display || "block"),"important");
  }

  function resetViews(){
    const root=stage();
    if(!root) return;

    forceHidden(byId("n2k-os-overview"),true);
    forceHidden(byId("n2k-os-more"),true);
    forceHidden(root.querySelector(".messenger-search-wrap"),true);
    forceHidden(byId("messenger-chat-list"),true);
    forceHidden(byId("msg-contacts-view"),true);
    forceHidden(byId("msg-settings-view"),true);
    forceHidden(byId("msg-mesh-view"),true);
    forceHidden(root.querySelector(".messenger-conversation"),true);
  }

  function setActive(tab){
    const nav=byId("n2k-mobile-real-nav");
    if(!nav) return;
    nav.querySelectorAll("button").forEach(function(button){
      button.classList.toggle("active",button.dataset.n2kOsTab===tab);
    });
  }

  function showPage(page){
    if(!isMobile()) return false;

    ensureMore();
    resetViews();
    clearPageClasses();

    const root=stage();
    if(!root) return false;

    window.scrollTo({top:0,behavior:"smooth"});

    if(page==="overview"){
      const overview=byId("n2k-os-overview");
      forceHidden(overview,false,"block");
      document.body.classList.add("n2k-os-mobile-page-overview");
      setActive("overview");
      return false;
    }

    if(page==="chat"){
      forceHidden(root.querySelector(".messenger-search-wrap"),false,"block");
      forceHidden(byId("messenger-chat-list"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-chat");
      setActive("chat");
      try{
        const core=window.reticulumMessenger097;
        if(core && typeof core.loadContacts==="function") core.loadContacts();
      }catch(_){}
      return false;
    }

    if(page==="mesh"){
      forceHidden(byId("msg-mesh-view"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-mesh");
      setActive("mesh");
      return false;
    }

    if(page==="status"){
      forceHidden(byId("msg-settings-view"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-status");
      setActive("status");
      try{
        if(window.reticulumProfile099 &&
           typeof window.reticulumProfile099.loadIdentity==="function"){
          window.reticulumProfile099.loadIdentity();
        }
      }catch(_){}
      return false;
    }

    if(page==="contacts"){
      forceHidden(byId("msg-contacts-view"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-contacts");
      setActive("more");
      try{
        const core=window.reticulumMessenger097;
        if(core && typeof core.loadContacts==="function") core.loadContacts();
      }catch(_){}
      return false;
    }

    if(page==="more"){
      forceHidden(byId("n2k-os-more"),false,"block");
      document.body.classList.add("n2k-os-mobile-page-more");
      setActive("more");
      return false;
    }

    return false;
  }

  function rebuildBottomNav(){
    if(!isMobile()) return;
    const nav=byId("n2k-mobile-real-nav");
    if(!nav) return;

    nav.innerHTML=
      '<button type="button" data-n2k-os-tab="overview"><b>'+n2kIcon("overview")+'</b><small>Übersicht</small></button>'+
      '<button type="button" data-n2k-os-tab="chat"><b>'+n2kIcon("chat")+'</b><small>Chat</small></button>'+
      '<button type="button" data-n2k-os-tab="mesh"><b>'+n2kIcon("mesh")+'</b><small>Mesh</small></button>'+
      '<button type="button" data-n2k-os-tab="status"><b>'+n2kIcon("status")+'</b><small>Status</small></button>'+
      '<button type="button" data-n2k-os-tab="more"><b>'+n2kIcon("more")+'</b><small>Mehr</small></button>';

    nav.onclick=function(event){
      const button=event.target.closest("[data-n2k-os-tab]");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      showPage(button.dataset.n2kOsTab);
    };

    nav.addEventListener("click",function(event){
      if(event.target.closest("[data-n2k-os-tab]")){
        event.stopImmediatePropagation();
      }
    },true);
  }

  function wrapConversation(){
    if(!isMobile()) return;

    const oldOpen=window.openMessengerConversation;
    if(typeof oldOpen==="function" && !oldOpen.__n2kOs1231){
      const wrapped=function(peer){
        oldOpen(peer);
        setTimeout(function(){
          resetViews();
          clearPageClasses();
          const conversation=stage()?.querySelector(".messenger-conversation");
          forceHidden(conversation,false,"flex");
          document.body.classList.add("n2k-os-mobile-chat-open");
          setActive("chat");
          window.scrollTo({top:0,behavior:"smooth"});
        },0);
      };
      wrapped.__n2kOs1231=true;
      window.openMessengerConversation=wrapped;
    }

    const back=byId("messenger-back");
    if(back){
      back.onclick=function(event){
        if(event){event.preventDefault();event.stopPropagation();}
        return showPage("chat");
      };
    }
  }

  function boot(){
    if(!isMobile()) return;
    ensureMore();
    rebuildBottomNav();

    /* Older shell scripts re-bind the same controls after load. Re-assert
       the final router after their delayed binds have finished. */
    [0,350,1300,2200].forEach(function(delay){
      setTimeout(function(){
        rebuildBottomNav();
        wrapConversation();
      },delay);
    });

    setTimeout(function(){showPage("overview");},150);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }

  window.n2kOsMobilePage=showPage;
})();


/* N2K Unified App Router 1.24.4-beta1 */
(function(){
  "use strict";

  const PAGE_DEFS={
    overview:{title:"Übersicht",sub:"Live-Status, Living Mesh und aktuelle Aktivitäten"},
    chat:{title:"Chat",sub:"Nachrichten und Kontakte · LXMF Messenger"},
    mesh:{title:"Living Mesh",sub:"Live-Aktivität, Routen und Relays"},
    demo:{title:"Demo Mode",sub:"2:30 Social Story · Reticulum erklärt · Privacy Safe"},
    status:{title:"Status",sub:"Systemzustand, Funkstatus und Diagnose"},
    settings:{title:"Einstellungen",sub:"Identity, Netzwerk und Store & Forward"},
    setup:{title:"Setup",sub:"Gateway und RNode Schritt für Schritt einrichten"},
    about:{title:"Über / Lizenz",sub:"Projekt-, Versions- und Lizenzinformationen"},
    more:{title:"Mehr",sub:"Weitere Bereiche des Gateways"}
  };

  function byId(id){return document.getElementById(id);}
  function root(){return byId("n2k-mobile-real-content");}

  function makePage(name){
    let page=byId("n2k-page-"+name);
    if(page) return page;
    const r=root();
    if(!r) return null;

    page=document.createElement("section");
    page.id="n2k-page-"+name;
    page.className="n2k-app-page";
    page.dataset.n2kPage=name;

    if(name!=="overview"){
      const meta=PAGE_DEFS[name];
      const head=document.createElement("div");
      head.className="n2k-app-page-head";
      head.innerHTML="<div><h2></h2><p></p></div>";
      head.querySelector("h2").textContent=meta.title;
      head.querySelector("p").textContent=meta.sub;
      page.appendChild(head);
    }

    r.prepend(page);
    return page;
  }

  function move(id,pageName){
    const el=typeof id==="string" ? document.querySelector(id) : id;
    const page=makePage(pageName);
    if(el && page && el.parentElement!==page) page.appendChild(el);
  }

  function ensureDemoSurface(){
    const page=makePage("demo");
    if(!page || page.querySelector(".n2k-demo-mode")) return page;

    const surface=document.createElement("section");
    surface.className="n2k-demo-mode";
    surface.setAttribute("aria-label","N2K Social Demo Mode");

    surface.innerHTML=
      '<div class="n2k-demo-meta">'+
        '<div><span class="n2k-demo-kicker">SOCIAL STORY</span><strong>3:18 Auto Demo</strong><small>Warum · Entstehung · Reticulum · LXMF · Mesh · Nutzen · Zukunft · Mitmachen</small></div>'+
        '<div class="n2k-demo-badges"><span class="privacy">PRIVACY SAFE</span><span>SYNTHETIC DATA</span><span>15 KAPITEL</span></div>'+
      '</div>'+
      '<div class="n2k-demo-controls">'+
        '<div class="n2k-demo-controls-main">'+
          '<button type="button" data-demo-action="toggle">▶ Start</button>'+
          '<button type="button" data-demo-action="next">Nächste Szene</button>'+
          '<button type="button" data-demo-action="restart">↺ Neustart</button>'+
          '<button type="button" data-demo-action="voice" class="active">🔊 Sprecher AN</button>'+
          '<button type="button" data-demo-action="captions">CC Untertitel AUS</button>'+
          '<button type="button" data-demo-action="capture">● Aufnahme-Modus</button>'+
          '<button type="button" data-demo-action="fullscreen">⛶ Vollbild</button>'+
        '</div>'+
        '<div class="n2k-demo-runtime" id="n2k-demo-runtime">00:00 / ≥03:18</div>'+
        '<div class="n2k-demo-formats" role="group" aria-label="Social Format">'+
          '<button type="button" data-demo-format="portrait">9:16</button>'+
          '<button type="button" data-demo-format="square">1:1</button>'+
          '<button type="button" data-demo-format="wide" class="active">16:9</button>'+
        '</div>'+
      '</div>'+
      '<div class="n2k-demo-stage-wrap">'+
        '<div id="n2k-demo-stage" class="n2k-demo-stage" data-format="wide">'+
          '<div class="n2k-demo-grid" aria-hidden="true"></div>'+
          '<div class="n2k-demo-glow g1" aria-hidden="true"></div>'+
          '<div class="n2k-demo-glow g2" aria-hidden="true"></div>'+

          '<section class="n2k-demo-scene n2k-demo-scene-intro is-active" data-demo-scene="0">'+
            '<div class="n2k-demo-intro-core"><i></i><i></i><i></i><b>N2K</b></div>'+
            '<div class="n2k-demo-intro-copy"><span>N2K RNS GATEWAY</span><h3>Was passiert,<br>wenn das Netz weg ist?</h3><p>Reticulum · LXMF · Home Assistant · Offgrid</p></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-problem" data-demo-scene="1">'+
            '<div class="n2k-demo-story-copy"><span>WARUM?</span><h3>Kommunikation sollte nicht an einer Cloud hängen.</h3><p>Mobilfunk kann ausfallen. Internet kann fehlen. Lokale Infrastruktur kann trotzdem weiterarbeiten.</p></div>'+
            '<div class="n2k-demo-story-grid three"><article><b>01</b><strong>Kein Mobilfunk</strong><small>Funkwege können lokal weiter existieren.</small></article><article><b>02</b><strong>Internet weg</strong><small>Lokale Reticulum-Verbindungen bleiben möglich.</small></article><article><b>03</b><strong>Local First</strong><small>Eigene Hardware. Eigene Wege. Eigene Kontrolle.</small></article></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-origin" data-demo-scene="2">'+
            '<div class="n2k-demo-story-copy"><span>ENTSTEHUNG</span><h3>Aus einem Add-on wurde ein komplettes Gateway.</h3><p>Schritt für Schritt: Reticulum sichtbar machen, LXMF nutzbar machen und Funkhardware direkt in Home Assistant bringen.</p></div>'+
            '<div class="n2k-demo-devline"><i></i><div><b>01</b><strong>Reticulum Node</strong><small>Basis im Home-Assistant-Add-on</small></div><div><b>02</b><strong>LXMF Messenger</strong><small>Senden, Empfangen, Delivery Status</small></div><div><b>03</b><strong>Living Mesh</strong><small>Routen und Nodes visuell verstehen</small></div><div><b>04</b><strong>Monitoring</strong><small>Funk, Pfade und Systemzustand</small></div></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-reticulum" data-demo-scene="3">'+
            '<div class="n2k-demo-story-copy"><span>RETICULUM · TEIL 1</span><h3>Reticulum ist kein Messenger. Es ist das Netzwerk darunter.</h3><p>Ein Netzwerk-Stack für robuste Kommunikation über sehr unterschiedliche Transportwege.</p></div>'+
            '<div class="n2k-demo-explain-stack"><article><b>IDENTITY</b><span>Kryptografische Identitäten statt klassischer Benutzerkonten.</span></article><article><b>PATHS</b><span>Das Netz lernt, über welchen Weg ein Ziel erreichbar ist.</span></article><article><b>TRANSPORT</b><span>LoRa, LAN oder Internet können Teil desselben logischen Netzes sein.</span></article></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-transport" data-demo-scene="4">'+
            '<div class="n2k-demo-story-copy"><span>RETICULUM · TEIL 2</span><h3>Ein Ziel. Unterschiedliche Wege.</h3><p>Die Anwendung muss nicht wissen, ob der nächste Hop über Funk, LAN oder einen Internet-Backbone läuft.</p></div>'+
            '<div class="n2k-demo-transport-map"><div class="hub">RNS</div><div class="transport radio">LoRa<br><small>RNode</small></div><div class="transport lan">LAN<br><small>AutoInterface</small></div><div class="transport tcp">TCP<br><small>Backbone</small></div><div class="transport peer">Peer<br><small>Destination</small></div><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-lxmf" data-demo-scene="5">'+
            '<div class="n2k-demo-story-copy"><span>LXMF</span><h3>Darauf baut der Messenger auf.</h3><p>LXMF übernimmt Nachrichten, Zustellung und Store-&-Forward-Funktionen auf Reticulum.</p></div>'+
            '<div class="n2k-demo-lxmf-flow"><div><b>TEXT</b><span>Nachricht entsteht lokal</span></div><i>→</i><div><b>LXMF</b><span>Adressierung & Zustellung</span></div><i>→</i><div><b>RNS</b><span>findet den Transportweg</span></div><i>→</i><div><b>PEER</b><span>direkt oder später erreichbar</span></div></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-architecture" data-demo-scene="6">'+
            '<div class="n2k-demo-story-copy"><span>DIE APP</span><h3>Alles an einem Ort.</h3><p>Home Assistant wird zur Oberfläche für Messenger, Funkhardware, Netzstatus und Reticulum-Diagnose.</p></div>'+
            '<div class="n2k-demo-architecture"><div class="app">N2K RNS Gateway</div><div class="layer"><b>Messenger</b><span>LXMF</span></div><div class="layer"><b>Living Mesh</b><span>Topologie</span></div><div class="layer"><b>Monitoring</b><span>Status</span></div><div class="layer"><b>RNode</b><span>LoRa</span></div><div class="foundation">RETICULUM</div></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-scene-mesh" data-demo-scene="7">'+
            '<div class="n2k-demo-scene-label">LIVING MESH · CINEMATIC</div>'+
            '<svg class="n2k-demo-mesh-svg" viewBox="0 0 1000 560" aria-hidden="true">'+
              '<defs><filter id="n2k-demo-glow-filter" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
              '<g class="routes"><path id="dm-r1" d="M500 280 Q385 120 205 150"/><path id="dm-r2" d="M500 280 Q650 110 805 165"/><path id="dm-r3" d="M500 280 Q700 330 850 390"/><path id="dm-r4" d="M500 280 Q350 420 185 410"/><path id="dm-r5" d="M500 280 Q520 455 610 490"/><path id="dm-r6" d="M500 280 Q430 245 330 270"/></g>'+
              '<g class="particles"><circle r="4"><animateMotion dur="3.6s" repeatCount="indefinite"><mpath href="#dm-r1"/></animateMotion></circle><circle r="4"><animateMotion dur="4.1s" begin="-1.4s" repeatCount="indefinite"><mpath href="#dm-r2"/></animateMotion></circle><circle r="3.4"><animateMotion dur="3.1s" begin="-.8s" repeatCount="indefinite"><mpath href="#dm-r4"/></animateMotion></circle></g>'+
              '<g class="core" transform="translate(500 280)"><circle class="aura" r="52"/><circle class="pulse" r="36"/><polygon points="0,-25 25,0 0,25 -25,0"/><circle class="dot" r="5"/><text y="70" text-anchor="middle">N2K CORE</text></g>'+
              '<g class="node radio" transform="translate(205 150)"><circle class="halo" r="24"/><circle class="orb" r="10"/><text x="18" y="4">RADIO</text></g><g class="node internet" transform="translate(805 165)"><circle class="halo" r="23"/><circle class="orb" r="9"/><text x="18" y="4">INTERNET</text></g><g class="node local" transform="translate(850 390)"><circle class="halo" r="22"/><circle class="orb" r="9"/><text x="18" y="4">LOCAL</text></g><g class="node ghost" transform="translate(185 410)"><circle class="halo" r="20"/><circle class="orb" r="8"/><text x="18" y="4">GHOST</text></g><g class="node internet" transform="translate(610 490)"><circle class="halo" r="18"/><circle class="orb" r="8"/><text x="18" y="4">RELAY</text></g><g class="node radio" transform="translate(330 270)"><circle class="halo" r="18"/><circle class="orb" r="8"/><text x="18" y="4">RNode</text></g>'+
            '</svg>'+
            '<div class="n2k-demo-mesh-status"><span><b>12</b> live</span><span><b>186</b> seen</span><span><b>16.8k</b> paths</span><span><b>24</b> relays</span></div>'+
            '<div class="n2k-demo-bottom-explain"><b>Living Mesh</b><span>macht unsichtbare Routen, Relays und Aktivität verständlich.</span></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-rnode" data-demo-scene="8">'+
            '<div class="n2k-demo-story-copy"><span>RNODE · LORA</span><h3>Der Funkweg wird Teil des Gateways.</h3><p>Ein RNode verbindet Reticulum mit LoRa-Hardware. Die App zeigt Status, Verbindung und Funkmetriken direkt an.</p></div>'+
            '<div class="n2k-demo-rnode-visual"><div class="device"><b>RNode</b><small>USB · LoRa</small></div><div class="waves"><i></i><i></i><i></i><i></i></div><div class="air"><span>-94 dBm</span><b>RADIO LINK</b></div></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-scene-message" data-demo-scene="9">'+
            '<div class="n2k-demo-scene-label">LXMF MESSENGER · PRIVACY SAFE</div>'+
            '<div class="n2k-demo-phone"><div class="n2k-demo-phone-head"><span class="avatar">A</span><div><strong>Node A</strong><small>LXMF · verbunden</small></div><i></i></div><div class="n2k-demo-chat-row in"><span>Neue LXMF-Nachricht empfangen</span><small>Inhalt geschützt · gerade eben</small></div><div class="n2k-demo-chat-row out"><span>Antwort über Reticulum</span><small>zugestellt ✓✓</small></div><div class="n2k-demo-privacy-card"><b>PRIVACY SAFE</b><span>Keine echten Namen · keine Nachrichtentexte · keine Destination Hashes</span></div></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-forward" data-demo-scene="10">'+
            '<div class="n2k-demo-story-copy"><span>STORE & FORWARD</span><h3>Nicht gleichzeitig online? Trotzdem nicht das Ende.</h3><p>LXMF kann Propagation Nodes nutzen, damit Nachrichten zwischengespeichert und später zugestellt werden können.</p></div>'+
            '<div class="n2k-demo-forward-flow"><div class="sender">A</div><i></i><div class="store"><b>PROPAGATION</b><span>STORE</span></div><i></i><div class="receiver">B</div><em>offline → später online → Zustellung</em></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-scene-monitor" data-demo-scene="11">'+
            '<div class="n2k-demo-scene-label">NETWORK MONITOR · RNODE</div>'+
            '<div class="n2k-demo-monitor-grid"><article><small>VERFÜGBARKEIT</small><strong>100%</strong><svg viewBox="0 0 180 50"><path d="M0 38 L25 34 L48 35 L70 23 L93 28 L115 18 L140 20 L180 10"/></svg></article><article><small>RETICULUM-PFADE</small><strong>16.8k</strong><svg viewBox="0 0 180 50"><path d="M0 42 L25 39 L48 30 L70 33 L93 24 L115 21 L140 13 L180 8"/></svg></article><article><small>PFAD-DYNAMIK</small><strong>+18</strong><svg viewBox="0 0 180 50"><path d="M0 35 L25 27 L48 36 L70 17 L93 31 L115 15 L140 22 L180 9"/></svg></article><article><small>RNODE FUNK</small><strong>-94 dBm</strong><svg viewBox="0 0 180 50"><path d="M0 31 L25 30 L48 33 L70 25 L93 28 L115 21 L140 25 L180 19"/></svg></article></div>'+
            '<div class="n2k-demo-radio-wave"><i></i><i></i><i></i><b>RNode · LoRa</b></div>'+
            '<div class="n2k-demo-bottom-explain"><b>Monitoring</b><span>zeigt Trends statt nur Momentaufnahmen.</span></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-development" data-demo-scene="12">'+
            '<div class="n2k-demo-story-copy"><span>ENTWICKLUNG</span><h3>Gebaut auf echter Hardware. Iteriert in kleinen Schritten.</h3><p>UI, Messenger, QR, RNode-Automatik, Store & Forward, Living Mesh und Monitoring wurden Stück für Stück zusammengeführt.</p></div>'+
            '<div class="n2k-demo-progress-stack"><div><b>BUILD</b><span>Feature entwickeln</span></div><i>→</i><div><b>TEST</b><span>auf Home Assistant & Hardware</span></div><i>→</i><div><b>FIX</b><span>Fehler und UX verbessern</span></div><i>→</i><div><b>PUSH</b><span>neue Beta</span></div></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-story n2k-demo-story-goals" data-demo-scene="13">'+
            '<div class="n2k-demo-story-copy"><span>ZIELE</span><h3>Kommunikation verständlich, lokal und widerstandsfähig machen.</h3><p>Weniger Kommandozeile. Mehr Übersicht. Einfacher Einstieg. Mehr echte Offgrid-Möglichkeiten.</p></div>'+
            '<div class="n2k-demo-goals"><article><b>01</b><strong>Einfach</strong><span>Einsteiger sollen Nodes und Messenger ohne Spezialwissen bedienen können.</span></article><article><b>02</b><strong>Resilient</strong><span>Lokale Wege sollen auch ohne klassische Cloud funktionieren.</span></article><article><b>03</b><strong>Offen</strong><span>Hardware, Transportwege und Ideen sollen kombinierbar bleiben.</span></article><article><b>04</b><strong>Sichtbar</strong><span>Mesh, Funk und Routen werden grafisch begreifbar.</span></article></div>'+
          '</section>'+

          '<section class="n2k-demo-scene n2k-demo-scene-finale n2k-demo-join" data-demo-scene="14">'+
            '<div class="n2k-demo-finale-orbit"><i></i><i></i><i></i><b>N2K</b></div>'+
            '<span>OPEN DEVELOPMENT · MITMACHEN</span>'+
            '<h3>NEUGIERIG?<br>BAU MIT.</h3>'+
            '<p>Teste die App · melde Bugs · bring Ideen · teste Hardware · übersetze · entwickle mit</p>'+
            '<div class="n2k-demo-join-box"><b>GitHub</b><span>netfreak2k/home-assistant-reticulum-dev</span><small>Issues · Feedback · Code · reale Feldtests</small></div>'+
            '<div class="n2k-demo-claim">KEIN NETZ · KEIN PROBLEM</div>'+
          '</section>'+

          '<div class="n2k-demo-transition" aria-hidden="true"><i></i><i></i></div>'+
          '<div id="n2k-demo-subtitles" class="n2k-demo-subtitles" aria-live="polite"><small id="n2k-demo-subtitle-kicker">N2K RNS GATEWAY</small><strong id="n2k-demo-subtitle-text">Was passiert, wenn das Netz weg ist?</strong></div>'+
          '<div class="n2k-demo-watermark">N2K RNS GATEWAY · DEMO MODE · PRIVACY SAFE</div>'+
        '</div>'+
      '</div>'+
      '<div class="n2k-demo-caption">'+
        '<div><span id="n2k-demo-scene-number">01 / 15</span><strong id="n2k-demo-scene-title">Was passiert, wenn das Netz weg ist?</strong><p id="n2k-demo-scene-description">Intro: Warum lokale, unabhängige Kommunikation überhaupt interessant ist.</p></div>'+
        '<div class="n2k-demo-timeline" aria-label="Demo Fortschritt">'+
          '<i class="active"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>'+
        '</div>'+
      '</div>';

    page.appendChild(surface);
    return page;
  }

  function buildPages(){
    const r=root();
    if(!r) return false;

    Object.keys(PAGE_DEFS).forEach(makePage);

    /* Overview */
    move("#n2k-os-overview","overview");

    /* Chat */
    move(".messenger-search-wrap","chat");
    move("#messenger-chat-list","chat");
    move(".messenger-conversation","chat");

    /* Contacts / Mesh */
    move("#msg-contacts-view","chat");
    const announceStatus=byId("n2k-contact-announce-status");
    const messengerTools=document.querySelector(".messenger-search-wrap");
    if(announceStatus&&messengerTools&&announceStatus.parentElement!==messengerTools) messengerTools.appendChild(announceStatus);
    move("#msg-mesh-view","mesh");

    /* Status = only status/health/diagnostics */
    [
      "#n2k-status-overview",
      "#n2k-radio-widget",
      "#n2k-resilience-card",
      "#n2k-selftest-card"
    ].forEach(function(sel){move(sel,"status");});

    /* Settings = actual configuration surfaces */
    [
      "#m99-profile-panel",
      "#reticulum-network",
      "#reticulum-identity",
      "#n2k-propagation-card"
    ].forEach(function(sel){move(sel,"settings");});

    /* Setup = onboarding and hardware setup */
    [
      "#n2k-first-run-guide",
      "#n2k-setup-assistant",
      "#n2k-hardware-usb-card",
      "#n2k-help"
    ].forEach(function(sel){move(sel,"setup");});

    move(".n2k-about-card","about");

    ensureDemoSurface();

    const more=makePage("more");
    if(more && !more.querySelector(".n2k-os-more-grid")){
      const grid=document.createElement("div");
      grid.className="n2k-os-more-grid";
      grid.innerHTML=
        '<button class="n2k-os-more-card" type="button" data-page="settings"><b>'+n2kIcon("settings")+'Einstellungen</b><span>Identity, Netzwerk und Store & Forward</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-page="setup"><b>'+n2kIcon("setup")+'Setup</b><span>Gateway und RNode einrichten</span></button>'+
        '<button class="n2k-os-more-card n2k-demo-more-card" type="button" data-page="demo"><b><span class="n2k-demo-more-icon">▶</span>Demo Mode</b><span>2:30 Social Story · Privacy Safe</span></button>'+
        '<button class="n2k-os-more-card" type="button" data-page="about"><b>'+n2kIcon("about")+'Über / Lizenz</b><span>Version und Lizenzinformationen</span></button>';
      grid.addEventListener("click",function(e){
        const b=e.target.closest("[data-page]");
        if(b) showPage(b.dataset.page);
      });
      more.appendChild(grid);
    }

    document.body.classList.add("n2k-pages-ready");
    return true;
  }

  function hideAll(){
    document.querySelectorAll(".n2k-app-page").forEach(function(page){
      page.classList.remove("is-active");
      page.hidden=true;
      page.style.setProperty("display","none","important");
    });
  }

  function activateNav(name){
    document.querySelectorAll(".n2k-os-nav-button").forEach(function(btn){
      btn.classList.toggle("is-active",btn.dataset.n2kAction===name);
    });
    document.querySelectorAll("#n2k-mobile-real-nav [data-n2k-os-tab]").forEach(function(btn){
      btn.classList.toggle("active",btn.dataset.n2kOsTab===name);
    });
  }

  function setMessengerPanel(mode,chatFilter){
    const page=byId("n2k-page-chat");
    if(!page) return;
    const contactsMode=mode==="contacts";
    page.dataset.messengerPanel=contactsMode?"contacts":"chats";
    const search=page.querySelector(".messenger-search-wrap");
    const list=byId("messenger-chat-list");
    const contacts=byId("msg-contacts-view");
    const conv=page.querySelector(".messenger-conversation");
    [search,list,contacts,conv].forEach(function(el){
      if(!el) return;
      const visible=el===search||(contactsMode?el===contacts:el===list);
      el.hidden=!visible;
      el.style.setProperty("display",visible?"block":"none","important");
      if(visible){el.style.setProperty("visibility","visible","important");el.style.setProperty("opacity","1","important");}
    });
    if(conv) conv.classList.remove("n2k-unified-chat-open","n2k-real-chat-open","n2k-desktop-chat-open");
    ["height","max-height","min-height","overflow","flex-direction"].forEach(prop=>page.style.removeProperty(prop));
    const input=byId("messenger-search");
    if(input) input.placeholder=contactsMode?"Name oder LXMF-Adresse suchen…":"Chats durchsuchen…";
    if(typeof window.n2kSelectChatFilter==="function") window.n2kSelectChatFilter(contactsMode?"contacts":chatFilter||"all");
    if(contactsMode) window.reticulumMessenger097?.loadContacts();
    else window.reticulumMessengerChats097?.refresh();
  }
  window.n2kMessengerPanel=setMessengerPanel;

  function showPage(name){
    const contactsRequested=name==="contacts";
    if(contactsRequested) name="chat";
    if(!buildPages()) return false;
    hideAll();

    const page=byId("n2k-page-"+name);
    if(!page) return false;

    page.hidden=false;
    page.classList.add("is-active");
    page.style.setProperty("display","block","important");
    document.body.classList.remove(
      "n2k-overview-active",
      "n2k-os-mobile-page-overview",
      "n2k-os-mobile-page-chat",
      "n2k-os-mobile-page-mesh",
      "n2k-os-mobile-page-status",
      "n2k-os-mobile-page-contacts",
      "n2k-os-mobile-page-more",
      "n2k-os-mobile-chat-open"
    );

    activateNav(name);

    if(name==="demo"){
      window.n2kDemoMode?.enter?.();
    }else{
      window.n2kDemoMode?.exit?.();
    }

    if(name==="chat") setMessengerPanel(contactsRequested?"contacts":"chats");
    if (name === "chat") {
      const conversation = page.querySelector(".messenger-conversation");
      if (conversation) {
        conversation.classList.remove("n2k-unified-chat-open", "n2k-real-chat-open", "n2k-desktop-chat-open");
        conversation.hidden = true;
        conversation.style.setProperty("display", "none", "important");
      }
    }
    window.scrollTo({top:0,behavior:"smooth"});

    if(name==="contacts"){
      try{
        const core=window.reticulumMessenger097;
        if(core && typeof core.loadContacts==="function") core.loadContacts();
      }catch(_){}
    }

    if(name==="settings"){
      try{
        if(window.reticulumProfile099 &&
           typeof window.reticulumProfile099.loadIdentity==="function"){
          window.reticulumProfile099.loadIdentity();
        }
      }catch(_){}
    }

    return false;
  }

  function rebuildDesktopNav(){
    const list=document.querySelector(".n2k-os-nav-list");
    if(!list) return;

    list.innerHTML=
      '<button class="n2k-os-nav-button" data-n2k-action="overview"><span class="n2k-os-nav-icon">'+n2kIcon("overview")+'</span>Übersicht</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="chat"><span class="n2k-os-nav-icon">'+n2kIcon("chat")+'</span>Chat</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="mesh"><span class="n2k-os-nav-icon">'+n2kIcon("mesh")+'</span>Living Mesh</button>'+
      '<button class="n2k-os-nav-button n2k-demo-nav-button" data-n2k-action="demo"><span class="n2k-os-nav-icon n2k-demo-nav-icon">▶</span>Demo Mode</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="status"><span class="n2k-os-nav-icon">'+n2kIcon("status")+'</span>Status</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="settings"><span class="n2k-os-nav-icon">'+n2kIcon("settings")+'</span>Einstellungen</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="setup"><span class="n2k-os-nav-icon">'+n2kIcon("radio")+'</span>Setup</button>'+
      '<button class="n2k-os-nav-button" data-n2k-action="about"><span class="n2k-os-nav-icon">'+n2kIcon("about")+'</span>Über / Lizenz</button>';

    list.onclick=function(e){
      const btn=e.target.closest("[data-n2k-action]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      showPage(btn.dataset.n2kAction);
    };
  }

  function rebuildMobileNav(){
    const nav=byId("n2k-mobile-real-nav");
    if(!nav) return;

    nav.innerHTML=
      '<button type="button" data-n2k-os-tab="overview"><b>'+n2kIcon("overview")+'</b><small>Übersicht</small></button>'+
      '<button type="button" data-n2k-os-tab="chat"><b>'+n2kIcon("chat")+'</b><small>Chat</small></button>'+
      '<button type="button" data-n2k-os-tab="mesh"><b>'+n2kIcon("mesh")+'</b><small>Mesh</small></button>'+
      '<button type="button" data-n2k-os-tab="status"><b>'+n2kIcon("status")+'</b><small>Status</small></button>'+
      '<button type="button" data-n2k-os-tab="more"><b>'+n2kIcon("more")+'</b><small>Mehr</small></button>';

    nav.onclick=function(e){
      const btn=e.target.closest("[data-n2k-os-tab]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      showPage(btn.dataset.n2kOsTab);
    };
  }

  function wrapChatOpen(){
    const old=window.openMessengerConversation;
    if(typeof old==="function" && !old.__n2kUnified1240){
      const wrapped=function(peer){
        peer = String(peer || "").trim().toLowerCase();
        if (!/^[0-9a-f]{32}$/.test(peer)) return;
        const previousPanel=byId("n2k-page-chat")?.dataset.messengerPanel||"chats";
        showPage("chat");
        old(peer);
        // The legacy inbox/status and external conversation renderer must
        // target the same peer, including contacts without message history.
        if (typeof window.openLXMFChat === "function") window.openLXMFChat(peer);
        const selected = window.reticulumMessenger097?.state.contacts.find(contact =>
          String(contact.destination_hash || "").toLowerCase() === peer);
        const title = byId("lxmf-chat-name");
        if (title && selected?.display_name) title.textContent = selected.display_name;
        function revealConversation(){
          const page=byId("n2k-page-chat");
          if(page){page.dataset.messengerPanel="conversation";page.dataset.messengerReturnPanel=previousPanel;}
          const contacts=byId("msg-contacts-view");
          if(contacts){contacts.hidden=true;contacts.style.setProperty("display","none","important");}
          const conv=page?.querySelector(".messenger-conversation");
          const search=page?.querySelector(".messenger-search-wrap");
          const list=page?.querySelector("#messenger-chat-list");
          if(search) search.style.setProperty("display","none","important");
          if(list) list.style.setProperty("display","none","important");
          if(conv){
            conv.classList.add("n2k-unified-chat-open", "n2k-real-chat-open", "n2k-desktop-chat-open");
            conv.hidden=false;
            conv.style.setProperty("display","flex","important");
            conv.style.setProperty("visibility","visible","important");
            const composer = byId("lxmf-chat-content");
            if (composer) composer.focus();
          }
        }
        revealConversation();
        setTimeout(revealConversation,0);
      };
      wrapped.__n2kUnified1240=true;
      window.openMessengerConversation=wrapped;
    }

    const back=byId("messenger-back");
    if(back){
      back.onclick=function(e){
        if(e){e.preventDefault();e.stopPropagation();}
        const returnPanel=byId("n2k-page-chat")?.dataset.messengerReturnPanel||"chats";
        showPage(returnPanel==="contacts"?"contacts":"chat");
        return false;
      };
    }
  }

  function boot(){
    if(!buildPages()) return;

    rebuildDesktopNav();
    rebuildMobileNav();
    wrapChatOpen();

    /* Old scripts run delayed. Re-assemble after all known legacy binds. */
    [250,900,1800,3000].forEach(function(delay){
      setTimeout(function(){
        buildPages();
        rebuildDesktopNav();
        rebuildMobileNav();
        wrapChatOpen();
        const active=document.querySelector(".n2k-app-page.is-active");
        if(!active) showPage("overview");
      },delay);
    });

    showPage("overview");
    window.n2kShowPage=showPage;
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* =========================================================
   N2K Demo Mode 1.30.52-beta1
   Production social story · narrator-safe variable pacing.
   Privacy rule: synthetic-only. No API/chat/contact access.
   ========================================================= */
(function(){
  "use strict";

  const SCENES=[
    {
      title:"Was passiert, wenn das Netz weg ist?",
      description:"Der Hook: Kommunikation darf nicht an einem einzigen Netz hängen.",
      kicker:"KEIN NETZ?",
      duration:11,
      narration:"Was passiert, wenn Mobilfunk oder Internet plötzlich weg sind? Genau hier beginnt die Idee hinter N2K RNS Gateway."
    },
    {
      title:"Warum Local First?",
      description:"Lokale Kommunikation als zusätzlicher, unabhängiger Weg.",
      kicker:"WARUM LOCAL FIRST?",
      duration:14,
      narration:"Cloud und Mobilfunk sind praktisch. Aber sie sollten nicht der einzige Weg sein. Lokale Infrastruktur kann auch dann weiterarbeiten, wenn draußen nichts mehr geht."
    },
    {
      title:"Wie das Gateway entstanden ist",
      description:"Vom Reticulum-Node zum integrierten Home-Assistant-Gateway.",
      kicker:"ENTSTEHUNG",
      duration:14,
      narration:"Das Projekt begann mit einem Reticulum Node in Home Assistant. Daraus wurden Messenger, Living Mesh, RNode Integration, Monitoring und ein kompletter Gateway Workflow."
    },
    {
      title:"Reticulum erklärt · Netzwerk",
      description:"Identitäten, Pfade und Transport statt klassischer Serverlogik.",
      kicker:"RETICULUM · TEIL 1",
      duration:12,
      narration:"Reticulum ist nicht der Messenger. Es ist das Netzwerk darunter. Kryptografische Identitäten, gelernte Pfade und flexible Transportwege bilden die Grundlage."
    },
    {
      title:"Reticulum erklärt · Transport",
      description:"LoRa, LAN und Internet als austauschbare Transportwege.",
      kicker:"RETICULUM · TEIL 2",
      duration:15,
      narration:"Ein Ziel kann über LoRa, über das lokale Netzwerk oder über einen Internet Backbone erreichbar sein. Die Anwendung muss den konkreten Transportweg nicht selbst verwalten."
    },
    {
      title:"LXMF erklärt",
      description:"Nachrichten und Zustellung auf dem Reticulum-Netz.",
      kicker:"LXMF",
      duration:13,
      narration:"LXMF setzt auf Reticulum auf. Es kümmert sich um Nachrichten, Zustellung und kann mit Propagation Nodes auch Store and Forward Szenarien abbilden."
    },
    {
      title:"N2K RNS Gateway",
      description:"Messenger, Mesh, Funk und Diagnose in einer Oberfläche.",
      kicker:"DIE APP",
      duration:13,
      narration:"N2K RNS Gateway bringt diese Technik in Home Assistant zusammen. Messenger, Funkhardware, Netzstatus, Diagnose und Visualisierung landen in einer gemeinsamen Oberfläche."
    },
    {
      title:"Living Mesh",
      description:"Routen, Relays und Aktivität werden grafisch verständlich.",
      kicker:"LIVING MESH",
      duration:12,
      narration:"Living Mesh macht sichtbar, was normalerweise im Hintergrund passiert. Nodes, Relays, Routen, Aktivität und Transportarten werden zu einem lebenden Netzwerkbild."
    },
    {
      title:"RNode & LoRa",
      description:"Reticulum-Funk direkt am Home-Assistant-Gateway.",
      kicker:"RNODE · LORA",
      duration:13,
      narration:"Mit einem RNode wird LoRa zum Funkweg des Gateways. Die App zeigt Verbindung, Funkstatus und wichtige Werte direkt und verständlich an."
    },
    {
      title:"Privacy Messenger",
      description:"Die Social-Demo verwendet ausschließlich synthetische Daten.",
      kicker:"PRIVACY SAFE",
      duration:14,
      narration:"Auch beim Messenger gilt Datenschutz zuerst. Im Demo Mode erscheinen keine echten Namen, keine Nachrichtentexte und keine Destination Hashes. Alles hier ist synthetisch."
    },
    {
      title:"Store & Forward",
      description:"Nachrichten können auf spätere Erreichbarkeit warten.",
      kicker:"STORE & FORWARD",
      duration:13,
      narration:"Ist ein Ziel gerade nicht erreichbar, muss eine Nachricht nicht zwangsläufig verloren sein. LXMF kann Propagation Nodes für eine spätere Zustellung nutzen."
    },
    {
      title:"Monitoring",
      description:"Trends für Pfade, Verfügbarkeit und Funk statt bloßer Momentwerte.",
      kicker:"NETWORK INTELLIGENCE",
      duration:12,
      narration:"Monitoring zeigt nicht nur den aktuellen Zustand. Verfügbarkeit, Pfade, Dynamik und Funkwerte werden über Zeit sichtbar und dadurch besser einschätzbar."
    },
    {
      title:"Entwicklung",
      description:"Iterativ auf echter Hardware: bauen, testen, korrigieren, pushen.",
      kicker:"BUILD · TEST · FIX",
      duration:13,
      narration:"Die Entwicklung läuft iterativ auf echter Hardware. Ein Feature wird gebaut, getestet, korrigiert und erst danach in die nächste Beta übernommen."
    },
    {
      title:"Ziele",
      description:"Einfacher Einstieg, lokale Kontrolle und robuste Kommunikation.",
      kicker:"WOHIN GEHT ES?",
      duration:13,
      narration:"Das Ziel ist klar: weniger Kommandozeile, mehr Verständnis, lokale Kontrolle und ein Einstieg, den auch neue Nutzer ohne Reticulum Vorwissen schaffen."
    },
    {
      title:"Mach mit",
      description:"Teste, melde Bugs, bring Ideen und Hardwareerfahrung ein.",
      kicker:"NEUGIERIG?",
      duration:16,
      narration:"Du hast einen Raspberry Pi, einen RNode, Home Assistant oder einfach eine gute Idee? Teste mit, melde Bugs, probiere Hardware aus oder entwickle direkt auf GitHub mit."
    }
  ];

  const TOTAL_SECONDS=SCENES.reduce(function(sum,scene){
    return sum+scene.duration;
  },0);

  let sceneIndex=0;
  let running=false;
  let timer=null;
  let ticker=null;
  let sceneStartedAt=0;
  let pausedElapsed=0;
  let bound=false;
  let voiceEnabled=true;
  let captionsEnabled=false;
  let speechActive=false;
  let speechRunId=0;
  let captureEnabled=false;
  let transitionTimer=null;

  function byId(id){return document.getElementById(id);}
  function surface(){return document.querySelector("#n2k-page-demo .n2k-demo-mode");}
  function stage(){return byId("n2k-demo-stage");}
  function sceneDurationMs(index){
    return Math.max(1000,Number(SCENES[index]?.duration||10)*1000);
  }
  function elapsedBefore(index){
    return SCENES.slice(0,index).reduce(function(sum,scene){
      return sum+scene.duration;
    },0);
  }
  function formatTime(seconds){
    seconds=Math.max(0,Math.min(TOTAL_SECONDS,Math.floor(Number(seconds)||0)));
    const min=Math.floor(seconds/60);
    const sec=seconds%60;
    return String(min).padStart(2,"0")+":"+String(sec).padStart(2,"0");
  }
  function currentElapsed(){
    const base=elapsedBefore(sceneIndex);
    const currentDuration=SCENES[sceneIndex].duration;
    if(!running) return base+pausedElapsed;
    return base+Math.min(currentDuration,(performance.now()-sceneStartedAt)/1000);
  }
  function updateRuntime(){
    const node=byId("n2k-demo-runtime");
    if(node) node.textContent=formatTime(currentElapsed())+" / ≥"+formatTime(TOTAL_SECONDS);
    const root=stage();
    if(root){
      root.style.setProperty("--n2k-demo-progress",String(Math.min(1,currentElapsed()/TOTAL_SECONDS)));
    }
  }
  function startTicker(){
    stopTicker();
    ticker=setInterval(updateRuntime,200);
    updateRuntime();
  }
  function stopTicker(){
    if(ticker){clearInterval(ticker);ticker=null;}
  }
  function clearTimer(){
    if(timer){clearTimeout(timer);timer=null;}
  }
  function cancelSpeech(){
    speechRunId+=1;
    speechActive=false;
    try{
      if("speechSynthesis" in window) window.speechSynthesis.cancel();
    }catch(_ignore){}
  }
  function chooseGermanVoice(){
    try{
      const voices=window.speechSynthesis?.getVoices?.()||[];
      return voices.find(function(v){return /^de[-_]/i.test(v.lang);}) ||
        voices.find(function(v){return /german|deutsch/i.test(v.name);}) ||
        null;
    }catch(_ignore){return null;}
  }
  function speakScene(scene){
    cancelSpeech();
    if(!voiceEnabled || !scene || !("speechSynthesis" in window)) return;
    try{
      const runId=++speechRunId;
      const utterance=new SpeechSynthesisUtterance(scene.narration);
      utterance.lang="de-DE";
      utterance.rate=.92;
      utterance.pitch=1;
      utterance.volume=1;
      utterance.onstart=function(){
        if(runId===speechRunId) speechActive=true;
      };
      utterance.onend=function(){
        if(runId===speechRunId) speechActive=false;
      };
      utterance.onerror=function(){
        if(runId===speechRunId) speechActive=false;
      };
      const voice=chooseGermanVoice();
      if(voice) utterance.voice=voice;
      speechActive=true;
      window.speechSynthesis.speak(utterance);
    }catch(_ignore){
      speechActive=false;
    }
  }
  function updateControls(){
    const toggle=document.querySelector('[data-demo-action="toggle"]');
    const voice=document.querySelector('[data-demo-action="voice"]');
    const captions=document.querySelector('[data-demo-action="captions"]');
    const capture=document.querySelector('[data-demo-action="capture"]');
    if(toggle){
      toggle.textContent=running?"Ⅱ Pause":"▶ Start";
      toggle.classList.toggle("active",running);
    }
    if(voice){
      voice.textContent=voiceEnabled?"🔊 Sprecher AN":"🔊 Sprecher AUS";
      voice.classList.toggle("active",voiceEnabled);
    }
    if(captions){
      captions.textContent=captionsEnabled?"CC Untertitel AN":"CC Untertitel AUS";
      captions.classList.toggle("active",captionsEnabled);
    }
    if(capture){
      capture.textContent=captureEnabled?"■ Aufnahme beenden":"● Aufnahme-Modus";
      capture.classList.toggle("active",captureEnabled);
    }
    document.body.classList.toggle("n2k-demo-captions-off",!captionsEnabled);
    document.body.classList.toggle("n2k-demo-capture",captureEnabled);
  }
  function updateSubtitles(scene){
    const kicker=byId("n2k-demo-subtitle-kicker");
    const text=byId("n2k-demo-subtitle-text");
    if(kicker) kicker.textContent=scene.kicker||"N2K RNS GATEWAY";
    if(text) text.textContent=scene.narration||scene.description||scene.title;
  }
  function transition(){
    const root=stage();
    if(!root) return;
    clearTimeout(transitionTimer);
    root.classList.remove("is-transitioning");
    void root.offsetWidth;
    root.classList.add("is-transitioning");
    transitionTimer=setTimeout(function(){
      root.classList.remove("is-transitioning");
    },760);
  }
  function renderScene(index){
    const root=stage();
    if(!root) return;
    sceneIndex=((Number(index)||0)%SCENES.length+SCENES.length)%SCENES.length;
    pausedElapsed=0;
    sceneStartedAt=performance.now();
    transition();
    root.dataset.scene=String(sceneIndex);
    root.querySelectorAll("[data-demo-scene]").forEach(function(scene){
      scene.classList.remove("is-active");
    });
    const active=root.querySelector('[data-demo-scene="'+sceneIndex+'"]');
    if(active){
      void active.offsetWidth;
      active.classList.add("is-active");
    }
    const meta=SCENES[sceneIndex];
    const number=byId("n2k-demo-scene-number");
    const title=byId("n2k-demo-scene-title");
    const description=byId("n2k-demo-scene-description");
    if(number) number.textContent=String(sceneIndex+1).padStart(2,"0")+" / "+String(SCENES.length).padStart(2,"0");
    if(title) title.textContent=meta.title;
    if(description) description.textContent=meta.description;
    updateSubtitles(meta);
    document.querySelectorAll(".n2k-demo-timeline i").forEach(function(dot,i){
      dot.classList.toggle("active",i===sceneIndex);
      dot.classList.toggle("done",i<sceneIndex);
    });
    root.classList.remove("n2k-demo-scene-reset");
    void root.offsetWidth;
    root.classList.add("n2k-demo-scene-reset");
    speakScene(meta);
    updateRuntime();
  }
  function advanceScene(){
    if(!running) return;
    sceneIndex=(sceneIndex+1)%SCENES.length;
    renderScene(sceneIndex);
    schedule(sceneDurationMs(sceneIndex));
  }
  function waitForNarrationThenAdvance(){
    clearTimer();
    if(!running) return;
    const synthBusy=voiceEnabled && (
      speechActive ||
      (("speechSynthesis" in window) && (window.speechSynthesis.speaking || window.speechSynthesis.pending))
    );
    if(synthBusy){
      timer=setTimeout(waitForNarrationThenAdvance,250);
      return;
    }
    timer=setTimeout(advanceScene,900);
  }
  function schedule(remaining){
    clearTimer();
    if(!running) return;
    const wait=Math.max(250,Number(remaining)||sceneDurationMs(sceneIndex));
    timer=setTimeout(waitForNarrationThenAdvance,wait);
  }
  function resume(){
    if(running) return;
    running=true;
    sceneStartedAt=performance.now()-(pausedElapsed*1000);
    updateControls();
    speakScene(SCENES[sceneIndex]);
    schedule(sceneDurationMs(sceneIndex)-(pausedElapsed*1000));
    startTicker();
    document.body.classList.add("n2k-demo-running");
  }
  function pause(){
    if(running){
      pausedElapsed=Math.min(SCENES[sceneIndex].duration,(performance.now()-sceneStartedAt)/1000);
    }
    running=false;
    clearTimer();
    stopTicker();
    cancelSpeech();
    updateRuntime();
    updateControls();
    document.body.classList.remove("n2k-demo-running");
  }
  function toggle(){running?pause():resume();}
  function next(){
    sceneIndex=(sceneIndex+1)%SCENES.length;
    renderScene(sceneIndex);
    if(running) schedule(sceneDurationMs(sceneIndex));
  }
  function restart(){
    sceneIndex=0;
    pausedElapsed=0;
    running=true;
    renderScene(sceneIndex);
    updateControls();
    schedule(sceneDurationMs(sceneIndex));
    startTicker();
    document.body.classList.add("n2k-demo-running");
  }
  async function toggleFullscreen(){
    const root=stage();
    if(!root) return;
    try{
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(root.requestFullscreen) await root.requestFullscreen();
    }catch(_ignore){}
  }
  async function setCapture(enabled){
    captureEnabled=!!enabled;
    updateControls();
    const root=stage();
    if(!root) return;
    try{
      if(captureEnabled && !document.fullscreenElement && root.requestFullscreen){
        await root.requestFullscreen();
      }else if(!captureEnabled && document.fullscreenElement){
        await document.exitFullscreen();
      }
    }catch(_ignore){}
  }
  function setFormat(format){
    const root=stage();
    if(!root) return;
    if(!["portrait","square","wide"].includes(format)) format="wide";
    root.dataset.format=format;
    document.querySelectorAll("[data-demo-format]").forEach(function(button){
      button.classList.toggle("active",button.dataset.demoFormat===format);
    });
  }
  function bind(){
    if(bound) return;
    const root=surface();
    if(!root) return;
    bound=true;
    root.addEventListener("click",function(event){
      const action=event.target.closest("[data-demo-action]");
      if(action){
        const name=action.dataset.demoAction;
        if(name==="toggle") toggle();
        else if(name==="next") next();
        else if(name==="restart") restart();
        else if(name==="voice"){
          voiceEnabled=!voiceEnabled;
          updateControls();
          if(voiceEnabled) speakScene(SCENES[sceneIndex]); else cancelSpeech();
        }else if(name==="captions"){
          captionsEnabled=!captionsEnabled;
          updateControls();
        }else if(name==="capture"){
          setCapture(!captureEnabled);
        }else if(name==="fullscreen"){
          toggleFullscreen();
        }
        return;
      }
      const formatButton=event.target.closest("[data-demo-format]");
      if(formatButton) setFormat(formatButton.dataset.demoFormat);
    });
    document.addEventListener("fullscreenchange",function(){
      if(!document.fullscreenElement && captureEnabled){
        captureEnabled=false;
        updateControls();
      }
    });
    renderScene(sceneIndex);
    updateControls();
  }
  function enter(){bind();restart();}
  function exit(){
    pause();
    if(captureEnabled) setCapture(false);
  }

  window.n2kDemoMode={
    enter:enter,
    exit:exit,
    start:resume,
    pause:pause,
    next:next,
    restart:restart,
    setFormat:setFormat,
    setCapture:setCapture,
    duration:TOTAL_SECONDS,
    scenes:SCENES.length,
    privacy:"synthetic-only"
  };
})();


/* N2K Final UX Fixes 1.24.4-beta1 */
(function(){
  "use strict";

  const LICENSE_TEXT="MIT License\n\nCopyright (c) 2026 Netfreak2k\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof the original N2K RNS Gateway software and associated documentation files\n(the \"Software\"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish,\ndistribute, sublicense, and/or sell copies of the Software, and to permit\npersons to whom the Software is furnished to do so, subject to the following\nconditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nThis license applies only to original N2K RNS Gateway code authored by\nNetfreak2k. Third-party components remain subject to their respective\nlicenses.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.";
  const THIRD_PARTY_TEXT="Original N2K SVG icons: CC0-1.0; free to use, modify and redistribute, including commercially. See ICONS_LICENSE.md.\n\nN2K RNS Gateway includes or depends on third-party software.\n\nReticulum / rns==1.5.4\nLicense: Reticulum License\nCopyright (c) 2016-2026 Mark Qvist\n\nLXMF / lxmf==1.1.1\nLicense: Reticulum License\nCopyright (c) 2020-2025 Mark Qvist\n\nPython qrcode / qrcode==7.4.2\nLicense: BSD 3-Clause-style license\n\nHome Assistant\nLicense: Apache License 2.0\nN2K RNS Gateway is not an official Home Assistant add-on.\n\nWhen redistributing N2K RNS Gateway, retain the project LICENSE,\nTHIRD_PARTY_NOTICES.md and all license/copyright notices required by\nbundled or installed third-party components.";

  function byId(id){return document.getElementById(id);}

  function ensureLicensePanel(){
    const page=byId("n2k-page-about");
    if(!page || page.querySelector(".n2k-license-panel")) return;

    const panel=document.createElement("section");
    panel.className="n2k-license-panel";

    const own=document.createElement("details");
    const ownSummary=document.createElement("summary");
    ownSummary.textContent="N2K RNS Gateway · MIT-Lizenz anzeigen";
    const ownContent=document.createElement("div");
    ownContent.className="n2k-license-content";
    const ownIntro=document.createElement("p");
    ownIntro.textContent="Diese Lizenz gilt für den originalen N2K-RNS-Gateway-Code von Netfreak2k.";
    const ownPre=document.createElement("pre");
    ownPre.textContent=LICENSE_TEXT;
    ownContent.append(ownIntro,ownPre);
    own.append(ownSummary,ownContent);

    const third=document.createElement("details");
    const thirdSummary=document.createElement("summary");
    thirdSummary.textContent="Drittanbieter-Lizenzen & Hinweise anzeigen";
    const thirdContent=document.createElement("div");
    thirdContent.className="n2k-license-content";
    const thirdPre=document.createElement("pre");
    thirdPre.textContent=THIRD_PARTY_TEXT;

    const links=document.createElement("div");
    links.className="n2k-license-links";

    [
      ["Reticulum Lizenz","https://github.com/markqvist/Reticulum/blob/master/LICENSE"],
      ["LXMF Lizenz","https://github.com/markqvist/LXMF/blob/master/LICENSE"],
      ["Python qrcode Lizenz","https://github.com/lincolnloop/python-qrcode/blob/main/LICENSE"],
      ["Home Assistant Lizenz","https://github.com/home-assistant/core/blob/dev/LICENSE.md"]
    ].forEach(function(item){
      const a=document.createElement("a");
      a.href=item[1];
      a.target="_blank";
      a.rel="noopener noreferrer";
      a.textContent=item[0];
      links.appendChild(a);
    });

    thirdContent.append(thirdPre,links);
    third.append(thirdSummary,thirdContent);

    panel.append(own,third);
    page.appendChild(panel);
  }

  function replaceMobileNav(){
    const old=byId("n2k-mobile-real-nav");
    if(!old || window.innerWidth>900) return;

    const nav=old.cloneNode(false);
    nav.id="n2k-mobile-real-nav";
    nav.className="n2k-mobile-real-nav n2k-final-mobile-nav";
    nav.setAttribute("aria-label","App Navigation");

    nav.innerHTML=
      '<button type="button" data-n2k-os-tab="overview"><b>'+n2kIcon("overview")+'</b><small>Übersicht</small></button>'+
      '<button type="button" data-n2k-os-tab="chat"><b>'+n2kIcon("chat")+'</b><small>Chat</small></button>'+
      '<button type="button" data-n2k-os-tab="mesh"><b>'+n2kIcon("mesh")+'</b><small>Mesh</small></button>'+
      '<button type="button" data-n2k-os-tab="status"><b>'+n2kIcon("status")+'</b><small>Status</small></button>'+
      '<button type="button" data-n2k-os-tab="more"><b>'+n2kIcon("more")+'</b><small>Mehr</small></button>';

    old.replaceWith(nav);

    nav.addEventListener("click",function(event){
      const button=event.target.closest("[data-n2k-os-tab]");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage(button.dataset.n2kOsTab);
      }
    });

    nav.addEventListener("touchend",function(event){
      const button=event.target.closest("[data-n2k-os-tab]");
      if(!button) return;
      event.preventDefault();
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage(button.dataset.n2kOsTab);
      }
    },{passive:false});
  }

  function hardenOverview(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1241) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="overview"){
        const page=byId("n2k-page-overview");
        const overview=byId("n2k-os-overview");

        document.querySelectorAll(".n2k-app-page").forEach(function(p){
          const active=p===page;
          p.hidden=!active;
          p.classList.toggle("is-active",active);
          p.style.setProperty("display",active?"block":"none","important");
        });

        if(overview){
          overview.hidden=false;
          overview.style.setProperty("display","block","important");
          overview.style.setProperty("visibility","visible","important");
          overview.style.setProperty("opacity","1","important");
        }
      }

      if(name==="about"){
        setTimeout(ensureLicensePanel,0);
      }

      return result;
    };

    wrapped.__n2k1241=true;
    window.n2kShowPage=wrapped;
  }

  function boot(){
    hardenOverview();
    ensureLicensePanel();

    /* Old delayed scripts have already attached listeners by now;
       replacing the node removes every stale listener in one operation. */
    [50,500,1600,3400].forEach(function(delay){
      setTimeout(function(){
        hardenOverview();
        replaceMobileNav();
        ensureLicensePanel();
      },delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Chat + Mesh Route Fix 1.24.4-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}

  function force(el,show,display){
    if(!el) return;
    el.hidden=!show;
    el.style.setProperty("display",show?(display||"block"):"none","important");
    if(show){
      el.style.setProperty("visibility","visible","important");
      el.style.setProperty("opacity","1","important");
    }
  }

  function fixChatPage(){
    const page=byId("n2k-page-chat");
    if(page?.dataset.messengerPanel==="contacts"||page?.dataset.messengerPanel==="conversation") return;
    if(!page) return;
    const search=page.querySelector(".messenger-search-wrap");
    const list=page.querySelector("#messenger-chat-list");
    const conv=page.querySelector(".messenger-conversation");

    force(search,true,"block");
    force(list,true,"block");
    force(conv,false,"flex");

    try{
      const core=window.reticulumMessenger097;
      if(core && typeof core.loadChats==="function") core.loadChats();
      if(core && typeof core.loadContacts==="function") core.loadContacts();
    }catch(_){}
  }

  function fixMeshPage(){
    const page=byId("n2k-page-mesh");
    const mesh=byId("msg-mesh-view");
    const card=byId("n2k-constellation-card");
    const svg=byId("n2k-constellation-svg");

    if(page){
      page.hidden=false;
      page.classList.add("is-active");
      page.style.setProperty("display","block","important");
    }
    force(mesh,true,"block");
    force(card,true,"block");
    if(svg){
      svg.style.setProperty("display","block","important");
      svg.style.setProperty("visibility","visible","important");
      svg.style.setProperty("opacity","1","important");
    }

    /* Existing Living Mesh loader already runs every 5 seconds.
       A resize event forces its current responsive layout to recalculate. */
    requestAnimationFrame(function(){
      window.dispatchEvent(new Event("resize"));
    });
  }

  function wrapShowPage(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1242) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="chat"){
        setTimeout(fixChatPage,0);
        setTimeout(fixChatPage,120);
      }

      if(name==="mesh"){
        setTimeout(fixMeshPage,0);
        setTimeout(fixMeshPage,120);
      }

      return result;
    };

    wrapped.__n2k1242=true;
    window.n2kShowPage=wrapped;
  }

  function installDirectNavCapture(){
    if(document.documentElement.dataset.n2kMeshCapture1242==="1") return;
    document.documentElement.dataset.n2kMeshCapture1242="1";

    document.addEventListener("click",function(event){
      const button=event.target.closest(".n2k-os-nav-button[data-n2k-action='mesh']");
      if(!button) return;
      event.preventDefault();
      event.stopPropagation();
      if(typeof window.n2kShowPage==="function"){
        window.n2kShowPage("mesh");
      }
    },true);
  }

  function boot(){
    wrapShowPage();
    installDirectNavCapture();

    [200,900,1900,3600].forEach(function(delay){
      setTimeout(function(){
        wrapShowPage();
        installDirectNavCapture();
      },delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Chat + Contacts Refresh 1.24.4-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}

  function refreshChat(){
    const page=byId("n2k-page-chat");
    if(page?.dataset.messengerPanel==="contacts"||page?.dataset.messengerPanel==="conversation") return;
    if(!page || !page.classList.contains("is-active")) return;

    const search=page.querySelector(".messenger-search-wrap");
    const list=byId("messenger-chat-list");
    const conv=page.querySelector(".messenger-conversation");
    if (conv?.classList.contains("n2k-unified-chat-open")) return;

    if(search){
      search.hidden=false;
      search.style.setProperty("display","block","important");
      search.style.setProperty("visibility","visible","important");
    }

    if(list){
      list.hidden=false;
      list.style.setProperty("display","block","important");
      list.style.setProperty("visibility","visible","important");
    }

    if(conv){
      conv.hidden=true;
      conv.style.setProperty("display","none","important");
    }

    try{
      if(window.reticulumMessengerChats097 &&
         typeof window.reticulumMessengerChats097.refresh==="function"){
        window.reticulumMessengerChats097.refresh();
      }
    }catch(error){
      console.warn("[N2K] chat refresh",error);
    }
  }

  function refreshContacts(){
    const page=byId("n2k-page-contacts");
    if(!page || !page.classList.contains("is-active")) return;

    const view=byId("msg-contacts-view");
    const head=page.querySelector(".m110-contact-head");
    const tools=page.querySelector(".m110-contact-tools");
    const list=byId("msg-contact-list");

    [view,head,tools,list].forEach(function(el){
      if(!el) return;
      el.hidden=false;
      el.style.setProperty("visibility","visible","important");
      el.style.setProperty("opacity","1","important");
    });

    if(view) view.style.setProperty("display","block","important");
    if(head) head.style.setProperty("display","flex","important");
    if(tools) tools.style.setProperty("display","flex","important");
    if(list) list.style.setProperty("display","block","important");

    try{
      const core=window.reticulumMessenger097;
      if(core && typeof core.loadContacts==="function"){
        core.loadContacts();
      }
    }catch(error){
      console.warn("[N2K] contacts refresh",error);
    }
  }

  function wrap(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1243) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="chat"){
        setTimeout(refreshChat,0);
        setTimeout(refreshChat,180);
      }

      if(name==="contacts"){
        setTimeout(refreshContacts,0);
        setTimeout(refreshContacts,180);
      }

      return result;
    };

    wrapped.__n2k1243=true;
    window.n2kShowPage=wrapped;
  }

  function boot(){
    wrap();
    [250,1000,2200,3800].forEach(function(delay){
      setTimeout(wrap,delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K Page Reparent Guard 1.24.4-beta1 */
(function(){
  "use strict";

  function byId(id){return document.getElementById(id);}

  function put(el,page){
    if(el && page && el.parentElement!==page){
      page.appendChild(el);
    }
  }

  function repairChat(){
    const page=byId("n2k-page-chat");
    if(page?.dataset.messengerPanel==="contacts"||page?.dataset.messengerPanel==="conversation") return;
    if(!page || !page.classList.contains("is-active")) return;

    const search=document.querySelector(".messenger-search-wrap");
    const list=byId("messenger-chat-list");
    const conv=document.querySelector(".messenger-conversation");

    put(search,page);
    put(list,page);
    put(conv,page);

    if(search){
      search.hidden=false;
      search.style.setProperty("display","block","important");
      search.style.setProperty("visibility","visible","important");
      search.style.setProperty("opacity","1","important");
    }

    if(list){
      list.hidden=false;
      list.style.setProperty("display","block","important");
      list.style.setProperty("visibility","visible","important");
      list.style.setProperty("opacity","1","important");
      list.style.setProperty("min-height","120px","important");
    }

    if(conv && !conv.classList.contains("n2k-desktop-chat-open") &&
       !conv.classList.contains("n2k-real-chat-open")){
      conv.hidden=true;
      conv.style.setProperty("display","none","important");
    }

    try{
      if(window.reticulumMessengerChats097 &&
         typeof window.reticulumMessengerChats097.refresh==="function"){
        window.reticulumMessengerChats097.refresh();
      }
    }catch(_){}
  }

  function repairContacts(){
    const page=byId("n2k-page-contacts");
    if(!page || !page.classList.contains("is-active")) return;

    const view=byId("msg-contacts-view");
    put(view,page);

    if(view){
      view.hidden=false;
      view.style.setProperty("display","block","important");
      view.style.setProperty("visibility","visible","important");
      view.style.setProperty("opacity","1","important");
      view.style.setProperty("height","auto","important");
      view.style.setProperty("max-height","none","important");
      view.style.setProperty("overflow","visible","important");
    }

    const head=view?.querySelector(".m110-contact-head");
    const tools=view?.querySelector(".m110-contact-tools");
    const list=byId("msg-contact-list");

    if(head){
      head.hidden=false;
      head.style.setProperty("display","flex","important");
      head.style.setProperty("visibility","visible","important");
      head.style.setProperty("opacity","1","important");
    }

    if(tools){
      tools.hidden=false;
      tools.style.setProperty("display","flex","important");
      tools.style.setProperty("visibility","visible","important");
      tools.style.setProperty("opacity","1","important");
    }

    if(list){
      list.hidden=false;
      list.style.setProperty("display","block","important");
      list.style.setProperty("visibility","visible","important");
      list.style.setProperty("opacity","1","important");
      list.style.setProperty("min-height","120px","important");
    }

    try{
      const core=window.reticulumMessenger097;
      if(core && typeof core.loadContacts==="function"){
        core.loadContacts();
      }
    }catch(_){}
  }

  function repairActive(){
    repairChat();
    repairContacts();
  }

  function wrapShowPage(){
    const original=window.n2kShowPage;
    if(typeof original!=="function" || original.__n2k1244) return;

    const wrapped=function(name){
      const result=original(name);

      if(name==="chat" || name==="contacts"){
        [0,80,250,650,1400].forEach(function(delay){
          setTimeout(repairActive,delay);
        });
      }

      return result;
    };

    wrapped.__n2k1244=true;
    window.n2kShowPage=wrapped;
  }

  function installObserver(){
    if(document.documentElement.dataset.n2kReparent1244==="1") return;
    document.documentElement.dataset.n2kReparent1244="1";

    const root=byId("n2k-mobile-real-content");
    if(!root) return;

    const observer=new MutationObserver(function(){
      repairActive();
    });

    observer.observe(root,{
      childList:true,
      subtree:false
    });

    window.setInterval(repairActive,1200);
  }

  function boot(){
    wrapShowPage();
    installObserver();
    repairActive();

    [300,1200,2600,4200].forEach(function(delay){
      setTimeout(function(){
        wrapShowPage();
        repairActive();
      },delay);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }
})();


/* N2K live node leaderboard · score reflects real announce freshness and route data. */
(function(){
  "use strict";

  const WINDOW_SECONDS=24*60*60;
  const byId=id=>document.getElementById(id);

  function ensureLeaderboard(){
    const overview=byId("n2k-os-overview");
    if(!overview || byId("n2k-showcase-footer")) return;
    const footer=document.createElement("section");
    footer.id="n2k-showcase-footer";
    footer.className="n2k-showcase-footer";
    footer.setAttribute("aria-label","Aktivste Reticulum-Nodes");
    footer.innerHTML=
      '<section class="n2k-rank-panel">'+
        '<div class="n2k-rank-head">'+
          '<div class="n2k-rank-brand"><span class="n2k-rank-mark">✦</span><div><small>N2K MESH · HIGH SCORE</small><strong>Aktivste Nodes</strong></div></div>'+
          '<div class="n2k-rank-meta"><span class="n2k-rank-live"><i></i>LIVE RANKING</span><small>24 Stunden</small></div>'+
          '<div class="n2k-showcase-quick-grid" aria-label="Schnellzugriff">'+
            '<button type="button" data-n2k-quick="chat" aria-label="Neue Nachricht">'+n2kIcon("chat")+'<span>Nachricht</span></button>'+
            '<button type="button" data-n2k-quick="contacts" aria-label="Kontakte">'+n2kIcon("contacts")+'<span>Kontakte</span></button>'+
            '<button type="button" data-n2k-quick="mesh" aria-label="Living Mesh">'+n2kIcon("mesh")+'<span>Mesh</span></button>'+
          '</div>'+
        '</div>'+
        '<div class="n2k-node-ticker" aria-label="Live-Rangliste der aktivsten Nodes"><div id="n2k-node-leaderboard" class="n2k-node-leaderboard" aria-live="polite"><div class="n2k-rank-empty">Live-Signale werden geladen …</div></div></div>'+
      '</section>';
    overview.appendChild(footer);
    footer.querySelectorAll("[data-n2k-quick]").forEach(function(button){
      button.addEventListener("click",function(){
        if(typeof window.n2kShowPage==="function") window.n2kShowPage(button.dataset.n2kQuick);
      });
    });
  }

  function signalScore(item){
    const age=Math.max(0,Number(item.age_seconds)||0);
    const fresh=Math.max(0,1-Math.min(age,3600)/3600);
    const hops=Number(item.hops);
    const route=Number.isFinite(hops)&&hops<128?Math.max(0,1-hops/10):.1;
    const live=item.seen_during_scan===true?1:0;
    return Math.round(Math.max(.08,Math.min(1,(fresh*.62)+(route*.18)+(live*.20)))*1000);
  }

  function ageLabel(seconds){
    const age=Math.max(0,Number(seconds)||0);
    if(age<120) return "LIVE";
    if(age<3600) return Math.max(1,Math.round(age/60))+" MIN";
    return Math.max(1,Math.round(age/3600))+" H";
  }

  function renderLeaderboard(){
    ensureLeaderboard();
    const root=byId("n2k-node-leaderboard");
    if(!root) return;
    const source=window.n2kMeshLeaderboardContacts;
    if(!Array.isArray(source)){
      root.dataset.signature="";
      root.innerHTML='<div class="n2k-rank-empty">Live-Signale werden geladen …</div>';
      return;
    }
    const unique=new Map();
    source.forEach(item=>{
      const peer=String(item&&item.destination_hash||"").toLowerCase();
      const age=Number(item&&item.age_seconds);
      if(!/^[0-9a-f]{32}$/.test(peer)||!Number.isFinite(age)||age<0||age>WINDOW_SECONDS) return;
      if(!unique.has(peer)) unique.set(peer,Object.assign({},item,{destination_hash:peer,age_seconds:age}));
    });
    const ranked=Array.from(unique.values()).map(item=>Object.assign(item,{signal_xp:signalScore(item)}))
      .sort((a,b)=>b.signal_xp-a.signal_xp||Number(b.last_seen||0)-Number(a.last_seen||0))
      .slice(0,5);

    if(!ranked.length){
      root.dataset.signature="";
      root.innerHTML='<div class="n2k-rank-empty">Noch keine Nodes mit Announce in den letzten 24 Stunden.</div>';
      return;
    }
    const signature=ranked.map(item=>item.destination_hash+":"+String(item.display_name||item.announced_name||"")).join("|");
    if(root.dataset.signature===signature){
      ranked.forEach((item,index)=>{
        [root.children[index],root.children[index+ranked.length]].forEach(card=>{
          if(!card) return;
          const score=card.querySelector(".n2k-rank-score b");
          const meta=card.querySelector(".n2k-rank-info small");
          const meter=card.querySelector(".n2k-rank-meter i");
          if(score) score.textContent=String(item.signal_xp);
          if(meta) meta.textContent=item.destination_hash.slice(0,6)+"…"+item.destination_hash.slice(-4)+" · "+ageLabel(item.age_seconds);
          if(meter) meter.style.width=item.signal_xp/10+"%";
        });
      });
      return;
    }
    root.dataset.signature=signature;
    root.innerHTML="";
    ranked.forEach((item,index)=>{
      const rank=index+1;
      const card=document.createElement("article");
      card.className="n2k-rank-card n2k-rank-"+rank;
      const name=String(item.display_name||item.announced_name||"").trim()||item.destination_hash.slice(0,8)+"…";
      const initials=name.replace(/[^\p{L}\p{N} ]/gu,"").trim().split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase()||"N";
      card.innerHTML='<div class="n2k-rank-place"><span></span><small></small></div><div class="n2k-rank-avatar"></div><div class="n2k-rank-info"><strong></strong><small></small></div><div class="n2k-rank-score"><b></b><small>XP</small></div><div class="n2k-rank-meter"><i></i></div>';
      card.querySelector(".n2k-rank-place span").textContent=rank===1?"♛":String(rank).padStart(2,"0");
      card.querySelector(".n2k-rank-place small").textContent=rank===1?"MVP":rank===2?"ELITE":rank===3?"PRO":"RANK";
      card.querySelector(".n2k-rank-avatar").textContent=initials;
      card.querySelector(".n2k-rank-info strong").textContent=name;
      card.querySelector(".n2k-rank-info small").textContent=item.destination_hash.slice(0,6)+"…"+item.destination_hash.slice(-4)+" · "+ageLabel(item.age_seconds);
      card.querySelector(".n2k-rank-score b").textContent=String(item.signal_xp);
      card.querySelector(".n2k-rank-meter i").style.width=item.signal_xp/10+"%";
      root.appendChild(card);
    });
    Array.from(root.children).forEach(card=>{
      const copy=card.cloneNode(true);
      copy.classList.add("n2k-rank-duplicate");
      copy.setAttribute("aria-hidden","true");
      root.appendChild(copy);
    });
  }

  function boot(){
    ensureLeaderboard();
    renderLeaderboard();
    window.setInterval(renderLeaderboard,2500);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();

/* Current running node identity in the global header. */
(() => {
  "use strict";
  let loading = false;
  let lastName = "";
  async function refreshNodeName() {
    const button = document.getElementById("node-status");
    const label = button;
    if (!button || !label || loading || document.hidden) return;
    loading = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("api/node/identity?ts=" + Date.now(), {
        cache: "no-store", signal: controller.signal
      });
      const data = await response.json();
      const name = String(data?.lxmf_display_name || "").trim();
      if (!response.ok || !name) throw new Error("Node identity unavailable");
      lastName = name;
      label.dataset.nodeName = name;
      button.title = "Aktueller Node: " + name + " · Namen in den Einstellungen ändern";
      button.setAttribute("aria-label", "Aktueller Node: " + name + ". Einstellungen öffnen");
    } catch (_) {
      if (!lastName) label.dataset.nodeName = "Name nicht verfügbar";
      button.title = lastName ? "Zuletzt gelesener Node-Name: " + lastName : "Node-Name noch nicht verfügbar";
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }
  window.reticulumNodeHeader = {refresh: refreshNodeName};
  function init() {
    const button = document.getElementById("node-status");
    if (button) {
      button.onclick = () => {
        if (typeof window.n2kShowPage === "function") window.n2kShowPage("settings");
      };
      button.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          button.click();
        }
      });
    }
    refreshNodeName();
    setInterval(refreshNodeName, 30000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshNodeName();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else { init(); }
})();

/* Keep the active chat fitted to the actual visible window, including mobile navigation and keyboard resize. */
(function(){
  "use strict";
  const openClasses=".messenger-conversation:is(.n2k-unified-chat-open,.n2k-real-chat-open,.n2k-desktop-chat-open)";
  let resizeFrame=0;
  let layoutObserver=null;
  const layoutObserverOptions={subtree:true,attributes:true,attributeFilter:["class","hidden","style"]};
  function activeConversation(){
    return document.querySelector("#n2k-page-chat "+openClasses)||
      document.querySelector("#n2k-mobile-real-content "+openClasses)||
      document.querySelector(openClasses);
  }
  function fit(){
    const conversation=activeConversation();
    if(!conversation||conversation.hidden||getComputedStyle(conversation).display==="none") return;
    // Layout changes must not schedule another layout pass themselves.
    if(layoutObserver) layoutObserver.disconnect();
    try {
    const visual=window.visualViewport;
    const viewportHeight=Math.floor(visual?visual.height:window.innerHeight);
    const viewportTop=visual?visual.offsetTop:0;
    const page=conversation.closest("#n2k-page-chat");
    const shell=page||conversation.closest("#n2k-mobile-real-content");
    const shellRect=(shell||conversation).getBoundingClientRect();
    let bottom=8;
    const nav=document.getElementById("n2k-mobile-real-nav");
    if(nav&&getComputedStyle(nav).display!=="none"){
      const navRect=nav.getBoundingClientRect();
      if(navRect.height>0&&navRect.top<viewportHeight+viewportTop&&navRect.bottom>viewportTop){
        bottom=Math.max(bottom,Math.ceil(viewportHeight-(navRect.top-viewportTop)+8));
      }
    }
    const top=Math.max(0,Math.floor(shellRect.top-viewportTop));
    const height=Math.max(180,viewportHeight-top-bottom-8);
    if(shell){
      shell.style.setProperty("display","flex","important");
      shell.style.setProperty("flex-direction","column","important");
      shell.style.setProperty("height",height+"px","important");
      shell.style.setProperty("min-height","0","important");
      shell.style.setProperty("max-height",height+"px","important");
      shell.style.setProperty("overflow","hidden","important");
      shell.style.setProperty("box-sizing","border-box","important");
    }
    conversation.style.setProperty("display","flex","important");
    conversation.style.setProperty("flex","1 1 auto","important");
    conversation.style.setProperty("flex-direction","column","important");
    conversation.style.setProperty("width","100%","important");
    conversation.style.setProperty("height","100%","important");
    conversation.style.setProperty("min-height","0","important");
    conversation.style.setProperty("max-height","100%","important");
    conversation.style.setProperty("margin","0","important");
    conversation.style.setProperty("overflow","hidden","important");
    conversation.style.setProperty("box-sizing","border-box","important");
    const inbox=conversation.querySelector("#lxmf-inbox")||document.getElementById("lxmf-inbox");
    if(inbox){
      inbox.style.setProperty("flex","1 1 0%","important");
      inbox.style.setProperty("height","0","important");
      inbox.style.setProperty("min-height","0","important");
      inbox.style.setProperty("max-height","none","important");
      inbox.style.setProperty("overflow-y","auto","important");
    }
    const composer=conversation.querySelector(".lxmf-chat-compose");
    if(composer){
      composer.style.setProperty("position","relative","important");
      composer.style.setProperty("inset","auto","important");
      composer.style.setProperty("display","grid","important");
      composer.style.setProperty("grid-template-columns","auto auto minmax(0,1fr) auto","important");
      composer.style.setProperty("align-items","center","important");
      composer.style.setProperty("flex","0 0 auto","important");
      composer.style.setProperty("width","100%","important");
      composer.style.setProperty("height","auto","important");
      composer.style.setProperty("min-height","68px","important");
      composer.style.setProperty("max-height","none","important");
      composer.style.setProperty("padding","8px 10px max(10px,env(safe-area-inset-bottom,0px))","important");
      composer.style.setProperty("z-index","30","important");
      composer.style.setProperty("box-sizing","border-box","important");
      const input=composer.querySelector("#lxmf-chat-content");
      if(input){input.style.setProperty("height","46px","important");input.style.setProperty("min-height","46px","important");}
      composer.querySelectorAll("#n2k-photo-pick,#n2k-emoji-toggle,#lxmf-chat-send").forEach(button=>{
        button.style.setProperty("height","40px","important");
        button.style.setProperty("min-height","40px","important");
      });
    }
    } finally {
      if(layoutObserver) layoutObserver.observe(document.body,layoutObserverOptions);
    }
  }
  function schedule(){
    if(resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(function(){resizeFrame=0;fit();});
  }
  window.addEventListener("resize",schedule,{passive:true});
  if(window.visualViewport) window.visualViewport.addEventListener("resize",schedule,{passive:true});
  layoutObserver=new MutationObserver(function(records){
    const conversation=activeConversation();
    if(!conversation) return;
    // Mesh animations outside the conversation do not resize the composer.
    if(records.some(record=>record.target.contains(conversation)||conversation.contains(record.target))) schedule();
  });
  layoutObserver.observe(document.body,layoutObserverOptions);
  window.setInterval(fit,900);
  [0,120,360,900].forEach(delay=>window.setTimeout(fit,delay));
})();
