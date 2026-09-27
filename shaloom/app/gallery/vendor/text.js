'strict mode';

const textHeight = 32;
const textCanvas = document.createElement('canvas');
//document.body.appendChild(textCanvas);
//textCanvas.style.position = "fixed";
const maxWidth = textCanvas.width = textCanvas.height = 1024;
const ctx = textCanvas.getContext('2d');
ctx.mozImageSmoothingEnabled = false;
ctx.webkitImageSmoothingEnabled = false;
ctx.font = textHeight + "px Verdana";
ctx.textBaseline = "bottom";
ctx.fillStyle = "#aaa";

// from https://delphic.me.uk/tutorials/webgl-text
function createMultilineText(ctx, textToWrite, maxWidth, text) {
    var currentText = textToWrite;
    var futureText;
    var subWidth = 0;
    var maxLineWidth = 0;

    var wordArray = textToWrite.split(" ");
    var wordsInCurrent, wordArrayLength;
    wordsInCurrent = wordArrayLength = wordArray.length;

    // Reduce currentText until it is less than maxWidth or is a single word
    // futureText var keeps track of text not yet written to a text line
    while (ctx.measureText(currentText).width > maxWidth && wordsInCurrent > 1) {
        wordsInCurrent--;
        currentText = futureText = "";
        for (var i = 0; i < wordArrayLength; i++) {
            if (i < wordsInCurrent) {
                currentText += wordArray[i];
                if (i + 1 < wordsInCurrent) currentText += " ";
            } else {
                futureText += wordArray[i];
                if (i + 1 < wordArrayLength) futureText += " ";
            }
        }
    }
    text.push(currentText); // Write this line of text to the array
    maxLineWidth = ctx.measureText(currentText).width;

    // If there is any text left to be written call the function again
    if (futureText) {
        subWidth = createMultilineText(ctx, futureText, maxWidth, text);
        if (subWidth > maxLineWidth) {
            maxLineWidth = subWidth;
        }
    }

    // Return the maximum line width
    return maxLineWidth;
}

module.exports = {
	init(texture, title, paintingWidth=maxWidth, description='') {
		ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
		const availableWidth = Math.min(paintingWidth * maxWidth, maxWidth);
		const titleLines = [];
		ctx.font = `${textHeight}px Verdana`;
		createMultilineText(ctx, title || 'Memory', availableWidth, titleLines);
		const descriptionLines = [];
		const cleanDescription = String(description || '').trim().replace(/\s+/g, ' ');
		if (cleanDescription) {
			ctx.font = '22px Verdana';
			createMultilineText(ctx, cleanDescription, availableWidth, descriptionLines);
		}
		const maxDescriptionLines = 2;
		const visibleDescription = descriptionLines.slice(0, maxDescriptionLines);
		const shownTitle = titleLines.slice(0, 2);
		ctx.textBaseline = 'bottom';
		ctx.fillStyle = '#f0e8d8';
		ctx.font = `${textHeight}px Verdana`;
		let y = textCanvas.height - (visibleDescription.length ? 72 : 16);
		for (const line of shownTitle) { ctx.fillText(line, 0, y); y += textHeight + 3; }
		if (visibleDescription.length) {
			ctx.fillStyle = '#c8c4b4';
			ctx.font = '22px Verdana';
			for (const line of visibleDescription) { ctx.fillText(line, 0, y); y += 24; }
			if (descriptionLines.length > maxDescriptionLines) ctx.fillText('…', 0, y);
		}

		return texture({
            data: textCanvas,
            min: 'mipmap',
            mipmap: 'nice',
            flipY: true
        });
    },
    draw(regl) {
        return regl({
            frag: `
            precision mediump float;
            uniform sampler2D tex;
            varying vec2 uv;

            void main () {
                float c = texture2D(tex, uv).r;
                gl_FragColor = vec4(0,0,0, c);
            }`,
            vert: `
            precision highp float;
            uniform mat4 proj, view, model;
            uniform float yScale;
            attribute vec2 pos;
            varying vec2 uv;
            void main () {
                uv = pos;
                vec4 mpos = model * vec4(pos, 0.001, 1);
                mpos.y *= yScale;
                gl_Position = proj * view * mpos;
            }`,
            attributes: {
                pos: [0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0]
            },
            uniforms: {
                model: regl.prop('textmodel'),
                tex: regl.prop('text')
            },
            count: 6,

            blend: {
                enable: true,
                func: {
                    srcRGB: 'src alpha',
                    srcAlpha: 'one minus src alpha',
                    dstRGB: 'one minus src alpha',
                    dstAlpha: 1
                },
                color: [0, 0, 0, 0]
            }
        });
    }
};
