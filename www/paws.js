'use strict';

/**
 * Paws & Pixels Interactive Effect
 * Purpose: Leaves a trail of fading paw prints behind the cursor.
 */

const initPawTrail = () => {
    const container = document.body;

    const createPaw = (x, y) => {
        const paw = document.createElement('div');
        paw.className = 'paw-print';

        // Random rotation so the prints look like natural walking
        const rotation = Math.random() * 40 - 20;

        paw.style.left = `${x}px`;
        paw.style.top = `${y}px`;
        paw.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        // Use a simple Unicode paw print or an SVG path
        paw.innerHTML = '🐾';

        container.appendChild(paw);

        // Remove element after animation ends to keep the DOM clean
        setTimeout(() => {
            paw.remove();
        }, 2000);
    };

    // Throttle the mousemove so we don't spawn 1000 paws a second
    let lastPos = { x: 0, y: 0 };
    window.addEventListener('mousemove', (e) => {
        const dist = Math.hypot(e.pageX - lastPos.x, e.pageY - lastPos.y);

        if (dist > 80) { // Only drop a paw every 80 pixels moved
            createPaw(e.pageX, e.pageY);
            lastPos = { x: e.pageX, y: e.pageY };
        }
    });

    window.addEventListener('click', (e) => {
        createPaw(e.pageX, e.pageY);
    });
};

document.addEventListener('DOMContentLoaded', initPawTrail);
