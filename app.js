/**
 * 更新manifest文件的缓存文件版本号，同时关联更新相关文件中被引用的缓存文件版本号
 * 缓存文件的文件名在不同目录下不能相同
 * 所有输出文件编码为utf-8
 */

var util = require('util'),
    cwd = process.cwd(),
    fs = require('fs'),
    path = require('path'),
    fileFilter = /\.(html|css|js)$/;

var StringDecoder = require('string_decoder').StringDecoder, decoder = new StringDecoder('utf8');

var cacheFiles = {}, oldCacheFile = {}, reCheckFile = [];

//从manifest中获取需缓存的文件及文件修改时间，放入cacheFiles中做映射
var manifestFilter = /\.manifest$/, manifestFiles = fs.readdirSync(cwd),
    manifestFile, manifestData, manifestCacheFiles,
    getCacheVersion = function(str){ //获取版本号
        return /\?v=(\d+)/.test(str) ? RegExp.$1 : '';
    }

for(var i in manifestFiles){
    var file = manifestFiles[i];
    if(manifestFilter.test(file)){ //获取第一个manifest文件
        manifestFile = file;
        manifestData = fs.readFileSync(manifestFile, 'utf8');
        var manifestCacheFiles = manifestData.match(/(.+)/g), isFileFilter = /\.[^\.]+$/;

        if(manifestCacheFiles && manifestCacheFiles.length){

            for(var x in manifestCacheFiles){
                var cacheFile = manifestCacheFiles[x];
                if(cacheFile == 'NETWORK:' || cacheFile == 'FALLBACK:'){ break; }
                else if(isFileFilter.test(cacheFile)){ //如果是缓存文件
                    reCheckFile.push(cacheFile);
                    var fileName = cacheFile.replace(/\?v=[0-9A-Za-z]+$/g, ''), mtime = fs.statSync(cwd + '/' + fileName).mtime;
                    mtime = util.format('%d%d%d%d%d', mtime.getFullYear(), mtime.getMonth() + 1, mtime.getDate(), mtime.getHours(), mtime.getMinutes());

                    if(mtime !== getCacheVersion(cacheFile)){
                        cacheFiles[path.basename(fileName)] = mtime; //映射cache文件和cache文件的修改日期
                    }
                }
            }
        }
        break;
    }
}

var cacheFilesRegExpArr = [], cacheFilesRegExp;
for(var i in cacheFiles){ cacheFilesRegExpArr.push(i); }

if(cacheFilesRegExpArr.length){
    cacheFilesRegExp = new RegExp('[\\(\'"][A-Za-z0-9/\._-]*(' + cacheFilesRegExpArr.join('|') + ')(?:\\?v=[0-9A-Za-z]+)?[\\)\'"]', 'g'); //匹配所有cache文件的正则

    //查找可能含cache文件的文件，并替换版本号
    var len = 0;
    function dirIterator(dir, success){
        var dir = dir || cwd;

        fs.readdir(dir, function(err, files){
            files.forEach(function(filename){
                var filePath = dir + '/' + filename;
                fs.stat(filePath, function(err, stats){
                    if(stats.isDirectory()){
                        dirIterator(filePath, success);
                    }else if(stats.isFile() && fileFilter.test(filename)){
                        (function(filePath){
                            fs.readFile(filePath, function(err, data){
                                if(!err){
                                    data = decoder.write(data);
                                    if(cacheFilesRegExp.test(data)){
                                        ++len;
                                        data = data.replace(cacheFilesRegExp, function(matchStr, file){
                                            matchStr = matchStr.replace(/\?v=[0-9A-Za-z]+/g, '').replace(new RegExp(file, 'g'), file + '?v=' + cacheFiles[file]); //更新缓存文件版本号
                                            return matchStr;
                                        });
                                        fs.writeFile(filePath, data, function(){ //更新含缓存文件的文件
                                            console.log('update file:' + filePath);
											if(!cacheFiles[path.basename(filePath)]){ cacheFilesRegExpArr.push(path.basename(filePath)) }
                                            !--len && success();
                                        });
                                    }
                                }
                            });
                        })(filePath);
                    };
                });
            });
        });
    }

    cacheFilesRegExp && dirIterator(null, function(){
		//因有多重关联时，如 a-> b-> c，更新c时，a不会更新，需2次修改
		cacheFilesRegExp = new RegExp('[\\(\'"][A-Za-z0-9/\._-]*(' + cacheFilesRegExpArr.join('|') + ')(?:\\?v=[0-9A-Za-z]+)?[\\)\'"]', 'g'); //再次生成匹配所有cache文件的正则	
		
		//重新生成匹配所有cache文件的正则
		console.log('update again');
		//TODO 不需要2次修改
		dirIterator(null, function(){
			for(var x in reCheckFile){
				var cacheFile = reCheckFile[x], fileName = cacheFile.replace(/\?v=[0-9A-Za-z]+$/g, ''), 
					mtime = fs.statSync(cwd + '/' + fileName).mtime,
					mtime = util.format('%d%d%d%d%d', mtime.getFullYear(), mtime.getMonth() + 1, mtime.getDate(), mtime.getHours(), mtime.getMinutes());

				manifestData = manifestData.replace(cacheFile, fileName + '?v=' + mtime); //更新manifest里的相应缓存文件版本号
			}

			fs.writeFile(manifestFile, manifestData, function(){ console.log('finish') }); //更新整个manifest
		});
    });
}else{
    //TODO 没cache文件提示
}