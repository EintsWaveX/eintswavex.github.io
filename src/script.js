if (history.scrollRestoration) {
    history.scrollRestoration = 'manual';
} else {
    window.onbeforeunload = function () {
        window.scrollTo(0, 0);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    var navToggle = document.getElementById('nav-toggle');
    if (!navToggle) return;
    document.querySelectorAll('.nav-links a').forEach(function (link) {
        link.addEventListener('click', function () {
            navToggle.checked = false;
        });
    });
});