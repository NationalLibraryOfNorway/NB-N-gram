min = 1810;
max = 2013;
slider_set = 0;
post = 0;
smooth_slider_set = 0;
default_terms = {terms: '', lang: 'all', case_sens: 0, freq: 'rel', corpus: 'bok'};

// spinner
var opts = {
  lines: 13, // The number of lines to draw
  length: 20, // The length of each line
  width: 10, // The line thickness
  radius: 30, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  direction: 1, // 1: clockwise, -1: counterclockwise
  color: '#000', // #rgb or #rrggbb or array of colors
  speed: 1, // Rounds per second
  trail: 60, // Afterglow percentage
  shadow: false, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  top: '30%', // Top position relative to parent
  left: '50%' // Left position relative to parent
};

var spinner = null;
var spinner_div = 0;

$(document).ready( function() {
    // clears localStorage at page load
    try {
        Object.keys(localStorage)
            .forEach(function(key){
                if (/ngram\/query\?/.test(key)) {
                    localStorage.removeItem(key);
                }
            });
    }
    catch(err)
    {
    }
    
    // local rule: deactivates language selection when the newspaper corpus is chosen
    $("#avis").click(function() {
        $("#nob").prop("disabled", true);
        $("#nno").prop("disabled", true);
        $("#nob").parent().css("color", "grey");
        $("#nno").parent().css("color", "grey");
    });

    $("#bok").click(function() {
          $("#nob").prop("disabled", false);
          $("#nno").prop("disabled", false);
          $("#all").prop("checked", true);
          $("#nob").parent().css("color", "");
          $("#nno").parent().css("color", "");
    });

    // query is started when the dropdown menu changes
    $("#dropdown-1").change(function(){
          search($('#terms').val(), $('input[name=lang]:checked').val(), $('input[name=corpus]:checked').val());
        }
    )

    spinner_div = $('#content-wrap').get(0);

    if (location.hash != '') {
        hash = location.href.split('#').splice(1).join('#');
        terms = hash.split('?').splice(1).join('?');
        params = $.deparam( terms );

        // default values are used when some options are not set
        params = $.extend(true, {}, default_terms, params);

        draw_lines('ngram/query?' + $.param ( params ) );

        set_fields();

    } else {
      draw_lines("ngram/static/defirestore.json");
      //location.hash = 'ngram/query?' + $.param ( default_terms );
    }

    // Range slider
    $('#slider').noUiSlider({
      start: [ min, max ],
      range: {
        'min': min,
        'max': max
             },

      // Full number format support.
      format: wNumb({
    	 mark: ',',
    	 decimals: 0
      }),
      // show selected range
    	connect: true,
    	behaviour: 'drag'
      });

    // Smoothing slider
    $('#smoothing_slider').noUiSlider({
      start: [ 4 ],
      range: {
        'min': 0,
        'max': 15
      },
      step: 1,
      format: wNumb({
        mark: ',',
        decimals: 0
      }),
      behaviour: 'drag'
      });

      // Slider_pips
      $("#slider").noUiSlider_pips({
      mode: 'values',
      values: [1810, 1850, 1890, 1930, 1970, 2010],
      density: 5,
      stepped: true
      });

      $("#smoothing_slider").noUiSlider_pips({
        mode: 'values',
        values: [0,5,10,15],
        density: 5
      });

      // A select element can't show any decimals
      $('#slider').Link('lower').to($('#input-select-lower'), null, wNumb({
      decimals: 0
      }));

      $('#slider').Link('upper').to($('#input-select-upper'), null, wNumb({
      decimals: 0
      }));

      // listens for changes in the range slider
      $("#slider").on({
      change: function(){
	slider_set = 1;
	user_minmax = $("#slider").val();
	range_update();
	}
      });

      // listens for changes in the input fields (max, min year)
      $("#input-select-lower").on("change", function() {
	slider_set = 1;
	user_minmax = $("#slider").val();
	range_update();
      });
      $("#input-select-upper").on("change", function() {
	slider_set = 1;
	user_minmax = $("#slider").val();
	range_update();
      });

      $("#smoothing_slider").on({
      change: function(){
	smooth_slider_set = 1;
	user_smooth_factor = $("#smoothing_slider").val();
	hash = location.href.split('#').splice(1).join('#');
	smooth_update(user_smooth_factor);
      }
      });

      // finds IE, from: http://stackoverflow.com/questions/19999388/jquery-check-if-user-is-using-ie
      var ua = window.navigator.userAgent;
      var old_ie = ua.indexOf('MSIE ');
      var new_ie = ua.indexOf('Trident/');

      if ((old_ie > -1) || (new_ie > -1)) {
	// no download of chart if IE is used
	document.getElementById("save_as_svg").disabled = true;
      }

    // Update the chart when window resizes.
    nv.utils.windowResize(function() { chart.update() });
});

//from: http://stackoverflow.com/questions/1403615/use-jquery-to-hide-a-div-when-the-user-clicks-outside-of-it
$(document).mousedown(function (e)
{
    var container = $("#chart");

    if (!container.is(e.target) // if the target of the click isn't the container...
        && container.has(e.target).length === 0) // ... nor a descendant of the container
    {
        if ($("#menu").length == true)
	{
	  menu.remove();
	}
    }
});

function lightbox(){
  $.colorbox({width:"80%", height:"80%", iframe:true, href:"ngram/static/iframe.html"});
}

function save_as_csv() {

    var data = raw_data;
    var user_minmax = $('#slider').val();
    var min = user_minmax[0];
    var max = user_minmax[1];
    var rows = [];

    // makes array of years
    rows.push(['anno']);
    for (var anno = min; anno <= max; anno ++) {
        rows.push([anno]);
        };

    // fills rows with values from JSON
    for (var i = 0; i < data.length; i++) {
      //  rows[0].push(data[i].key.replace(/[^a-z0-9]/gi,"_"));
        rows[0].push(data[i].key);
        var values = data[i].values;
        for (var j=1; j < rows.length; j ++) {
            var year_value = rows[j][0];
            var found_match = false;
            var k=0;
            while (!found_match && k < values.length) {
                if (values[k].x == year_value) {
                    rows[j].push(values[k].y);
                    found_match = true;
                }
                k++;
            }
            if (!found_match) {
                rows[j].push(0);
            }
        }
    };

    var data_csv = [Papa.unparse(rows)];
    var filename = rows[0].join().substring(5, 25).replace(/[^a-z0-9]/gi,"_");
    var csvBlob = new Blob(data_csv, {type: 'text/csv'});
    saveAs(csvBlob, 'ngram-'+ filename + '_' + min + '-' + max + '.csv');

}

function save_as_svg() {
    filename = document.getElementById("terms").value.substring(0, 20).replace(/[^a-z0-9]/gi,"_");
    if (filename == "") {
      filename = "grafikk";
    }
    var e = document.createElement('script');
    e.setAttribute('src', 'ngram/static/vendor/svg-crowbar-2-mod.js');
    e.setAttribute('class', 'svg-crowbar');
    document.body.appendChild(e);
};

function slider_update() {
    // updates min. year field
    $('#input-select-lower').empty();
    for ( var i = min; i <= max; i++ ){
         $('#input-select-lower').append(
          '<option value="'+i+'">'+i+'</option>'
          );
    }

    // updates max. year field
    $('#input-select-upper').empty();
    for ( var i = min; i <= max; i++ ){
        $('#input-select-upper').append(
          '<option value="'+i+'">'+i+'</option>'
        );
    }

    if (slider_set == 1) {

      // updates the slider
      $('#slider').noUiSlider({
	start: [ user_minmax[0], user_minmax[1] ],
	range: {
	  'min': min,
	  'max': max
	}
      }, true);

      // sets value of max. year field manually
      $('#input-select-upper').val(user_minmax[1]);
    }
    else {
	// updates the slider
      $('#slider').noUiSlider({
	start: [ min, max ],
	range: {
	  'min': min,
	  'max': max
	}
      }, true);

      // sets value of max. year field manually
      $('#input-select-upper').val(max);
    }

    $("#slider").noUiSlider_pips({
      mode: 'values',
      values: [1810, 1850, 1890, 1930, 1970, 2010],
      density: 5,
      stepped: true
    });
}

function set_fields() {
    // Updates input fields

    // terms
    if (params['terms'] != '') {
        document.getElementById("terms").value = decodeURIComponent(params['terms']);
    }
    // corpus
    document.getElementById(params['corpus']).checked = true;
    // language
    document.getElementById(params['lang']).checked = true;
    // case-sensitivity
    if (params['case_sens'] == '1') {
        document.getElementById("case_sens").checked = true;
    } else {
        document.getElementById("case_sens").checked = false;
    }
    // frequency
    document.getElementById(params['freq']).checked = true;
}

// Page reload when the hash changes
// From: http://benalman.com/projects/jquery-hashchange-plugin/
$(function(){

  // Bind the event.
  $(window).hashchange( function(){
    if (post != 1) {
        hash = location.href.split('#').splice(1).join('#');
        terms = hash.split('?').splice(1).join('?');
        params = $.deparam( terms );

        params = $.extend(true, {}, default_terms, params);

        if (localStorage.getItem(hash)) {
            localData = JSON.parse(localStorage.getItem(hash));
            draw_lines(localData);
        }
        else {
            draw_lines('ngram/query?' + $.param (params ));
        }

        set_fields();
    }
    else {
        post = 0;
    }
    })
});

// NVD3
function search(text, lang, corpus) {
    // checks for case-sensitive search
    if ( document.getElementById("case_sens").checked == true) {
        case_sens = 1;

    } else {
        case_sens = 0;
    }

    // checks for frequency
    if ( document.getElementById("rel").checked == true) {
        freq = "rel";
    } else {
        freq = "abs";
    }

    // builds query
    params = {terms: text, lang:lang, case_sens:case_sens, freq:freq, corpus:corpus}

    // updates the hash
    query = 'ngram/query?' + $.param ( params);

    // post indicates that a normal search is run (not initiated through a chnage in the hash)
    post = 1;
    // sends the query to the server, which returns the result as JSON, plot it locally
    if (localStorage.getItem(query)) {
        localData = JSON.parse(localStorage.getItem(query));
        draw_lines(localData);
    }
    else {
        draw_lines(query);
    }

    location.hash = query;
};

function bokhylla_search(label){

    if(label.match(':') != null){
       label = label.split(':')[0];
    }

    if(label.indexOf('+') > -1) {
      label = label.replace('+',' ');
    }
    else {
      label = '"' + label + '"';
    };

    return label;
};

function showMenu(pos, year_click, label_click) {

  // hides open menu
  if ( $("#menu").length == true)
  {
    menu.remove();
  }

  // gets position information
  var pLeft = pos[0] + 90;
  var pTop = pos[1] + 120;

  // margins
  if (pLeft > 900) {
    pLeft -= 250;
  }

  // gets years from slider
  slider_min = $("#slider").val()[0];
  slider_max = $("#slider").val()[1];

  // gets search term
  label_param = encodeURIComponent(bokhylla_search(label_click));

  // gets medium type (books or newspaper)
  try {
    if (params["corpus"] == 'avis') {
        media = 'aviser';
    }
    else {
        media = 'b%C3%B8ker';
    }
  }
  catch(err) {
    media = 'b%C3%B8ker';
  }

  // creates menu
  menu = $('<ul id="menu" style="position:absolute; left:' +
        pLeft +
        ';top:' +
        pTop +
        '">' +
	  "<li><a href='http://www.nb.no/nbsok/search?mediatype=" + media + "&searchString="
    + label_param +
    "&customDateFrom=" + (year_click - 1) +
    "&customDateTo=" + year_click +
    "' target='_blank'><span class='tab' onclick='menu.remove();'>Show entries for '"
    + label_click +
    "' in " + year_click + " in NBdigital</span></a>"
    + "</li><li><a href='http://www.nb.no/nbsok/search?mediatype=" + media + "&searchString="
    + label_param +
    "&customDateFrom=" + slider_min +
    "&customDateTo=" + slider_max +
    "' target='_blank'><span class='tab' onclick='menu.remove();'>Show entries for '"
    + label_click + "' between " + slider_min + " and " + slider_max +
    " in NBdigital</span></a>" +
    '</li><li id="remove-menu" onclick="menu.remove()">Close</li></ul>');

    menu.menu();

    $("#chart").append(menu);
}

function smooth_data(data, smooth_factor) {

    var result = [];
    smooth_factor = Number(smooth_factor);

    for (var i = 0; i < data.length; i++){
        var one_item = [];
        var values = data[i]["values"];
        var new_values = [];
        for (var pair =0; pair < values.length; pair++) {

            if (typeof values[pair]['f'] != 'undefined' && document.getElementById("abs").checked == true) {
                delete values[pair]['y'];
                values[pair]['y'] = values[pair]['f'];
                delete values[pair]['f'];
            }
            else if (typeof values[pair]['f'] != 'undefined' && document.getElementById("rel").checked == true) {
                delete values[pair]['f'];
            }

            var slice = values.slice(Math.max(0,pair - smooth_factor), pair + smooth_factor + 1);
            var avg = 2*values[pair]["y"];
            for (var j = 0; j < slice.length; j++) {
               avg += slice[j]["y"];
            }
            avg = avg/(slice.length + 2);
            new_values[pair] = {"x":values[pair]["x"], "y": avg};
        }
        result.push({"values":new_values, "key":data[i]["key"]});
    }
    return result;
};

function cumulative_graph(smoothed_data) {
    var result = [];

    for (var i = 0; i < smoothed_data.length; i++) {
        var values = smoothed_data[i]["values"];
        var new_values = [];

        for (var pair =0; pair < values.length; pair++) {
            if (pair > 0) {
                values[pair]['y'] = values[pair]['y']+values[pair-1]['y'];
            }
            new_values[pair] = {"x":values[pair]["x"], "y": values[pair]['y']};
        }
        result.push({"values":new_values, "key":smoothed_data[i]['key']});
    }
    return result;
}

function throw_error(msg) {
    // finds center position
    var $this = $('#chart');
    var offset = $this.offset();
    var width = $this.width();
    var height = $this.height();

    d3.selectAll("svg > *").remove();
    spinner.stop(spinner_div);

    try {
        d3.select('#chart svg').append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("dy", "-.7em")
        .attr("class", "nvd3 nv-noData")
        .style("text-anchor", "middle")
        .text(msg)
        .call(chart);
    }
    catch(err)
    {
        draw_lines("ngram/static/defirestore.json");
    }
}

function draw_lines(query) {
  try {
    d3.selectAll("svg > *").remove();
  }
  catch(err) {
  }

  if (smooth_slider_set == 1) {
    smooth_factor = user_smooth_factor;
  }
  else {
      smooth_factor = 4;
  }

  if (spinner == null) {
    spinner = new Spinner(opts).spin(spinner_div);
  }
  else {
    spinner.spin(spinner_div)
  }

  // if an JSON object is available in localStorage, draw locally
  if (typeof query === "string")
  {
    d3.json(query, function(error, data) {

     if (error) {
         if (error.status == 500) {
            return throw_error("The query was not accepted by the server, please try another term.");
         }
         else {
            return throw_error("The server is not responding.");
         }
     }

     raw_data = data;

     if (raw_data.length == 0) {
        smoothed_data = raw_data;
        return throw_error("No results.");
     }

     smoothed_data = smooth_data(data, smooth_factor)

     // stores result in localStorage (key = hash)
     hash = location.href.split('#').splice(1).join('#');

     if (query != "ngram/static/defirestore.json") {
       if (localStorage.getItem(hash) == null) {
          dataToStore = JSON.stringify(raw_data);
          localStorage.setItem(hash, dataToStore);
        }
      }
      return nvd3(smoothed_data);
    });
  }
  else {
    raw_data = query;
    smoothed_data = smooth_data(raw_data, smooth_factor);
    return nvd3(smoothed_data);
  }
};

function nvd3(smoothed_data) {
    nv.addGraph(function() {

    // custom colors (from: http://stackoverflow.com/questions/16191542/how-to-customize-color-in-pie-chart-of-nvd3)
    if ( document.getElementById("monochrome").checked == true ) {
      var myColors = ['rgb(0,0,0)', 'rgb(200,200,200)', 'rgb(100,100,100)', 'rgb(150,150,150)', 'rgb(50,50,50)']
    }
    else {
      var myColors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
    }

    d3.scale.myColors = function() {
        return d3.scale.ordinal().range(myColors);
    };

    chart = nv.models.lineChart()
          .margin({left: 120})  //Adjust chart margins to give the x-axis some breathing room.
          .margin({right: 50})  //Adjust chart margins to give the x-axis some breathing room.
          .useInteractiveGuideline(false)  //We want nice looking tooltips and a guideline!
          //.transitionDuration(350)  //how fast do you want the lines to transition?             // no longer supported, see duration()
          .duration(0)            // as responsive as possible
          .showLegend(true)       //Show the legend, allowing users to turn on/off line series.
          .showYAxis(true)        //Show the y-axis
          .showXAxis(true)        //Show the x-axis
          // applies the custom colors
          .color(d3.scale.myColors().range());
    ;

    // sets domain
    chart.xDomain([ 1810, 2013 ])

    if (document.getElementById("rel").checked == true ) {
         chart.yAxis
         .showMaxMin(false)
         .tickFormat(function(d) { return d + " %"; });
    } else {
         chart.yAxis
         .showMaxMin(false)
         .tickFormat(function(d) { return Math.round(d); });
    }
    //};

    if (document.getElementById("cumulative").checked == true) {
        smoothed_data = cumulative_graph(smoothed_data);
    }

    if (slider_set == 1) {
      range_update();
    } else {
        d3.select('#chart svg')    //Select the <svg> element you want to render the chart in.
        .datum(smoothed_data)         //Populate the <svg> element with chart data...
        .call(chart);          //Finally, render the chart!
    }

    // events for nvd3 (from: http://stackoverflow.com/questions/17598694/how-to-add-a-click-event-on-nvd3-js-graph)
    chart.lines.dispatch.on("elementClick", function(e) {
      pos = e.pos;
      year_click = e.point.x;
      label_click = e.series.key;

      // creates menu
      showMenu(pos, year_click, label_click);
    });

    // Chrome fix (https://github.com/novus/nvd3/issues/691)
    //d3.rebind('clipVoronoi');
    //chart.clipVoronoi(false);

    // no voronoi for better performance
    chart.useVoronoi(false);

    // updates the slider
    slider_update();

    // updates points
    resize_points();

    // stops spinner
    spinner.stop(spinner_div);

    return chart;
});
};

function resize_points() {
  // see: http://stackoverflow.com/questions/13732971/is-an-nvd3-line-plot-with-markers-possible
  setTimeout(function() {
            $('#chart .nv-lineChart circle.nv-point').attr("r", "3.0");
        }, 500);
}

function smooth_update(user_smooth_factor) {
    smoothed_data = smooth_data(raw_data, user_smooth_factor);

    if (document.getElementById("cumulative").checked == true) {
        smoothed_data = cumulative_graph(smoothed_data);
    }

    if (slider_set == 1) {
      range_update();
    }
    else {
	 d3.select('#chart svg')    //Select the <svg> element you want to render the chart in.
	 .datum(smoothed_data)         //Populate the <svg> element with chart data...
	 .call(chart);
   resize_points();
    }
};

function range_update() {
    // restricts domain
    chart.xDomain([ user_minmax[0], user_minmax[1] ])
    d3.select('#chart svg')    //Select the <svg> element you want to render the chart in.
	.datum(
	  smoothed_data
	    .filter(function(d) { return !d.disabled })
	    .map(function(d,i) {
		      return {
			key: d.key,
			values: d.values.filter(function(d,i) {
			  return chart.lines.x()(d,i) >= user_minmax[0] && chart.lines.x()(d,i) <= user_minmax[1];
			})
		      }
	    })
	)
	.call(chart);
  resize_points();
};
