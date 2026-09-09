/* IMS — thin static host for the client prototype.
   Serves the vanilla-JS SPA in wwwroot/ims-prototype. Site root ("/") redirects
   to the prototype, which is otherwise a static file host — no server-side UI.

   NOTE: the product will migrate to an Angular + Wisej.net stack; this host is
   only for local preview / static hosting of the prototype and should be
   replaced (not extended) when that migration lands. */
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Serve the prototype's static files under /ims-prototype/...
app.UseDefaultFiles();   // serve index.html at the directory root
app.UseStaticFiles();

// Redirect the bare site root to the prototype SPA.
app.MapGet("/", () => Results.Redirect("/ims-prototype/"));

app.Run();


