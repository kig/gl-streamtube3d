"use strict";

const vec3 = require('gl-vec3');
const vec4 = require('gl-vec4');

const streamToTube = function(stream) {
	const { points, velocities, divergences } = stream;
	//if (points.length < 10) return {};
	// debugger;
	var p, fwd, r, u, v, up;
	up = vec3.set(vec3.create(), 0, 1, 0);
	u = vec3.create();
	v = vec3.create();
	var p2 = vec3.create();

	var verts = [];
	var faces = [];
	var previousVerts = [];
	var currentVerts = [];
	var intensities = [];
	var previousIntensity = 0;
	var currentIntensity = 0;

	var facets = 8;

	for (var i = 0; i < points.length; i++) {
		p = points[i];
		fwd = velocities[i];
		r = divergences[i];
		currentIntensity = vec3.length(fwd);
		vec3.cross(u, up, fwd);
		vec3.normalize(u, u);
		vec3.cross(v, u, fwd);
		vec3.normalize(v, v);
		for (var a = 0; a < facets; a++) {
			var a0 = a/facets * Math.PI * 2;

			var p0 = vec3.create();
			vec3.add(p0, p0, u);
			vec3.scale(p0, p0, Math.cos(a0) * r);

			var p1 = vec3.create();
			vec3.add(p1, p1, v);
			vec3.scale(p1, p1, Math.sin(a0) * r);

			vec3.add(p0, p0, p1);
			vec3.add(p0, p0, p);

			currentVerts[a] = p0;
		}
		if (previousVerts.length > 0) {
			for (var a = 0; a < facets; a++) {
				var a1 = (a+1) % facets;
				verts.push(
					previousVerts[a],
					currentVerts[a],
					currentVerts[a1],

					currentVerts[a1],
					previousVerts[a1],
					previousVerts[a]
				);
				intensities.push(
					previousIntensity,
					currentIntensity,
					currentIntensity,

					currentIntensity,
					previousIntensity,
					previousIntensity
				);
				faces.push(
					[verts.length-6, verts.length-5, verts.length-4],
					[verts.length-3, verts.length-2, verts.length-1]
				);
			}
		}
		var tmp = previousVerts;
		previousVerts = currentVerts;
		currentVerts = tmp;
		tmp = previousIntensity;
		previousIntensity = currentIntensity;
		currentIntensity = tmp;
	}
	return {
		positions: verts,
		cells: faces,
		vertexIntensity: intensities
	};

};

const createTubes = function(streams, colormap) {
	var tubes = streams.map(streamToTube);
	var positions = [];
	var cells = [];
	var vertexIntensity = [];
	for (var i=0; i < tubes.length; i++) {
		var tube = tubes[i];
		var offset = positions.length;
		positions = positions.concat(tube.positions);
		vertexIntensity = vertexIntensity.concat(tube.vertexIntensity);
		cells = cells.concat(tube.cells.map(cell => cell.map(c => c + offset)));
	}
	return {
		positions: positions,
		cells: cells,
		vertexIntensity: vertexIntensity,
		colormap
	};
};

const defaultGetDivergence = function(p, v0, scale) {
	var dp = vec3.create();
	var e = 1/10000;

	vec3.add(dp, p, [e, 0, 0]);
	var vx = this.getVelocity(dp);
	vec3.subtract(vx, vx, v0);

	vec3.add(dp, p, [0, e, 0]);
	var vy = this.getVelocity(dp);
	vec3.subtract(vy, vy, v0);

	vec3.add(dp, p, [0, 0, e]);
	var vz = this.getVelocity(dp);
	vec3.subtract(vz, vz, v0);

	vec3.add(dp, vx, vy);
	vec3.add(dp, dp, vz);
	return vec3.length(dp) * scale;
};

const defaultGetVelocity = function(p) {
    var v = vec3.create();
    var u = sampleMeshgrid(p, this.vectors, this.meshgrid, this.clampBorders);
    if (this.vectorScale) {
    	vec3.multiply(v, u, this.vectorScale);
	} else {
		v = u;
	}
    return v;
};


const findLastSmallerIndex = function(points, v) {
  for (var i=0; i<points.length; i++) {
    if (points[i] >= v) {
      return i-1;
    }
  }
  return i;
};

const tmp = vec3.create();
const tmp2 = vec3.create();

const clamp = function(v, min, max) {
	return v < min ? min : (v > max ? max : v);
};

const sampleMeshgrid = function(point, array, meshgrid, clampOverflow) {
	const x = point[0];
	const y = point[1];
	const z = point[2];

	var w = meshgrid[0].length;
	var h = meshgrid[1].length;
	var d = meshgrid[2].length;

	// Find the index of the nearest smaller value in the meshgrid for each coordinate of (x,y,z).
	// The nearest smaller value index for x is the index x0 such that
	// meshgrid[0][x0] < x and for all x1 > x0, meshgrid[0][x1] >= x.
	var x0 = findLastSmallerIndex(meshgrid[0], x);
	var y0 = findLastSmallerIndex(meshgrid[1], y);
	var z0 = findLastSmallerIndex(meshgrid[2], z);

	// Get the nearest larger meshgrid value indices.
	// From the above "nearest smaller value", we know that
	//   meshgrid[0][x0] < x
	//   meshgrid[0][x0+1] >= x
	var x1 = x0 + 1;
	var y1 = y0 + 1;
	var z1 = z0 + 1;

	if (clampOverflow) {
		x0 = clamp(x0, 0, w-1);
		x1 = clamp(x1, 0, w-1);
		y0 = clamp(y0, 0, h-1);
		y1 = clamp(y1, 0, h-1);
		z0 = clamp(z0, 0, d-1);
		z1 = clamp(z1, 0, d-1);
	}

	// Reject points outside the meshgrid, return a zero vector.
	if (x0 < 0 || y0 < 0 || z0 < 0 || x1 >= w || y1 >= h || z1 >= d) {
		return vec3.create();
	}

	// Normalize point coordinates to 0..1 scaling factor between x0 and x1.
	var xf = (x - meshgrid[0][x0]) / (meshgrid[0][x1] - meshgrid[0][x0]);
	var yf = (y - meshgrid[1][y0]) / (meshgrid[1][y1] - meshgrid[1][y0]);
	var zf = (z - meshgrid[2][z0]) / (meshgrid[2][z1] - meshgrid[2][z0]);

	if (xf < 0 || xf > 1 || isNaN(xf)) xf = 0;
	if (yf < 0 || yf > 1 || isNaN(yf)) yf = 0;
	if (zf < 0 || zf > 1 || isNaN(zf)) zf = 0;

	var z0off = z0*w*h;
	var z1off = z1*w*h;

	var y0off = y0*w;
	var y1off = y1*w;

	var x0off = x0;
	var x1off = x1;

	// Sample data array around the (x,y,z) point.
	//  vZYX = array[zZoff + yYoff + xXoff]
	var v000 = array[y0off + z0off + x0off];
	var v001 = array[y0off + z0off + x1off];
	var v010 = array[y1off + z0off + x0off];
	var v011 = array[y1off + z0off + x1off];
	var v100 = array[y0off + z1off + x0off];
	var v101 = array[y0off + z1off + x1off];
	var v110 = array[y1off + z1off + x0off];
	var v111 = array[y1off + z1off + x1off];

	var result = vec3.create();

	// Average samples according to distance to point.
	vec3.lerp(result, v000, v001, xf);
	vec3.lerp(tmp, v010, v011, xf);
	vec3.lerp(result, result, tmp, yf);
	vec3.lerp(tmp, v100, v101, xf);
	vec3.lerp(tmp2, v110, v111, xf);
	vec3.lerp(tmp, tmp, tmp2, yf);
	vec3.lerp(result, result, tmp, zf);

	return result;
};

module.exports = function(vectorField, bounds) {
	var positions = vectorField.startingPositions;
	var maxLength = vectorField.maxLength || 1000;
	var widthScale = vectorField.widthScale || 1e4;

	if (!vectorField.getDivergence) {
		vectorField.getDivergence = defaultGetDivergence;
	}

	if (!vectorField.getVelocity) {
		vectorField.getVelocity = defaultGetVelocity;
	}

	if (vectorField.clampBorders === undefined) {
		vectorField.clampBorders = true;
	}

	var streams = [];

	const [minX, minY, minZ] = bounds[0];
	const [maxX, maxY, maxZ] = bounds[1];

	var inBounds = function(bounds, p) {
		var [x,y,z] = p;
		return (
			x >= minX && x <= maxX &&
			y >= minY && y <= maxY &&
			z >= minZ && z <= maxZ
		);
	};

	for (var i = 0; i < positions.length; i++) {
		var p = vec3.create();
		vec3.copy(p, positions[i]);

		var stream = [p];
		var velocities = [];
		var v = vectorField.getVelocity(p);
		velocities.push(v);
		var divergences = [vectorField.getDivergence(p, v, widthScale)];

		streams.push({points: stream, velocities: velocities, divergences: divergences});

		while (stream.length < maxLength && inBounds(bounds, p)) {
			var np = vec3.create();
			vec3.add(np, velocities[velocities.length-1], p);
			if (np[0] === p[0] && np[1] === p[1] && np[2] === p[2]) {
				break;
			}

			stream.push(np);
			var v = vectorField.getVelocity(np);
			velocities.push(v);
			var dv = vectorField.getDivergence(np, v, widthScale);
			divergences.push(dv);

			p = np;
		}
	}

	return createTubes(streams, vectorField.colormap);
};