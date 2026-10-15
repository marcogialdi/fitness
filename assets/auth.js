// Accesso con email e password (Supabase Auth): mostra il modulo nella card e notifica i cambi di utente.
window.Auth = { mount(card, sb, onChange){
  const box = card.querySelector("[data-auth]"); let user = null;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function set(u){
    user = u;
    box.innerHTML = u ? `<span>Connesso come <b>${esc(u.email)}</b></span><button class="pill" id="auth-out">Esci</button>`
      : `<input type="email" id="auth-em" placeholder="email" autocomplete="username"><input type="password" id="auth-pw" placeholder="password" autocomplete="current-password"><button class="pill on" id="auth-in">Accedi</button><span class="msg" id="auth-m"></span>`;
    if (u) box.querySelector("#auth-out").onclick = () => sb.auth.signOut();
    else {
      const go = async () => { const { error } = await sb.auth.signInWithPassword({ email: box.querySelector("#auth-em").value, password: box.querySelector("#auth-pw").value }); if (error) box.querySelector("#auth-m").textContent = error.message; };
      box.querySelector("#auth-in").onclick = go; box.querySelector("#auth-pw").onkeydown = e => { if (e.key === "Enter") go(); };
    }
    onChange(u);
  }
  sb.auth.getSession().then(({ data }) => set(data.session?.user || null));
  sb.auth.onAuthStateChange((_, s) => { if ((s?.user?.id || null) !== (user?.id || null)) set(s?.user || null); });
} };
